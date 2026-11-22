<?php

namespace App\Services;

use App\Models\DayPattern;
use App\Models\ScheduleEntry;
use App\Models\Section;
use App\Models\SectionSubject;
use App\Support\Curriculum;
use App\Support\ScheduleFormat;
use Illuminate\Support\Facades\DB;

/**
 * Soft rules: the entry is saved but flagged. Flags are worked out on every read,
 * so they can never go out of date. Submitting needs each flag fixed or acknowledged.
 *
 * Each flag has a key that changes when the problem changes, so a new problem
 * always needs a new acknowledgement.
 */
class FlagService
{
    /**
     * @return array<int, array{key: string, type: string, severity: string, message: string, blocking: bool, acknowledged: bool, section_subject_id?: int}>
     */
    public function forSection(Section $section, int $termId): array
    {
        $flags = [
            ...$this->adviser($section),
            ...$this->minutes($section, $termId),
            ...$this->openSlots($section, $termId),
            ...$this->noRoom($section, $termId),
            ...$this->breaksAndShifts($section, $termId),
            ...$this->overloadedTeachers($section, $termId),
            ...$this->longTeachingDays($section, $termId),
        ];

        $acknowledged = DB::table('schedule_flag_acknowledgements')
            ->where('term_id', $termId)
            ->where('section_id', $section->id)
            ->pluck('flag_key')
            ->all();

        return array_map(fn (array $flag) => [
            ...$flag,
            'blocking' => $flag['blocking'] ?? false,
            'acknowledged' => in_array($flag['key'], $acknowledged),
        ], $flags);
    }

    private function adviser(Section $section): array
    {
        return $section->adviser_id ? [] : [[
            'key' => 'no_adviser',
            'type' => 'no_adviser',
            'severity' => 'amber',
            'message' => 'This section has no adviser.',
        ]];
    }

    private function minutes(Section $section, int $termId): array
    {
        // Before anything is placed, every subject is short. That is a to-do list, not a problem.
        $isStarted = ScheduleEntry::where('term_id', $termId)
            ->where('section_id', $section->id)
            ->where('status', '<>', 'rejected')
            ->exists();

        if (! $isStarted) {
            return [];
        }

        // Homeroom Guidance: at most 40 minutes a week in Junior High, 60 in Senior High (Nov 22, 2026).
        $level = $section->gradeLevel->level;
        $limit = Curriculum::homeroomMinutes($level);
        $rows = DB::table('subject_minutes_check')
            ->where('term_id', $termId)
            ->where('section_id', $section->id)
            ->whereRaw("subject ~* 'home\s*room'")
            ->where('scheduled_minutes', '>', $limit)
            ->orderBy('subject')
            ->get();

        $flags = $rows->map(fn ($row) => [
            'key' => "minutes:{$row->section_subject_id}:{$row->scheduled_minutes}",
            'type' => 'minutes_over',
            'severity' => 'red',
            // Said as what to do: how many minutes to take away.
            'message' => "{$row->subject} has ".($row->scheduled_minutes - $limit)." minutes too many a week ({$row->scheduled_minutes} scheduled, at most {$limit}).",
            'section_subject_id' => $row->section_subject_id,
        ])->all();

        return $level === 'SHS' ? [...$flags, ...$this->seniorHighBlocks($section, $termId)] : $flags;
    }

    /**
     * Senior High block schedule (team decision, Nov 22, 2026): each subject needs its face-to-face
     * minutes (like 2 blocks of 120) and its asynchronous minutes (like 90) a week, from
     * config/curriculum.php. A subject with other minutes is flagged in amber, saying what is
     * missing or extra. Homeroom only has its limit above.
     */
    private function seniorHighBlocks(Section $section, int $termId): array
    {
        $placed = DB::table('schedule_entries')
            ->where('term_id', $termId)
            ->where('section_id', $section->id)
            ->where('status', '<>', 'rejected')
            ->whereNotNull('section_subject_id')
            ->groupBy('section_subject_id')
            ->selectRaw('section_subject_id,
                COALESCE(SUM(EXTRACT(EPOCH FROM (end_time - start_time)) / 60) FILTER (WHERE NOT is_async), 0)::INT AS f2f,
                COALESCE(SUM(EXTRACT(EPOCH FROM (end_time - start_time)) / 60) FILTER (WHERE is_async), 0)::INT AS async')
            ->get()
            ->keyBy('section_subject_id');

        $flags = [];
        $loadings = SectionSubject::with('subject')->where('term_id', $termId)->where('section_id', $section->id)->get();
        foreach ($loadings->sortBy(fn (SectionSubject $loading) => $loading->subject->name) as $loading) {
            if ($loading->subject->isHomeroom()) {
                continue;
            }
            $target = Curriculum::targetFor($loading->subject->name, 'SHS');
            $f2f = (int) ($placed[$loading->id]->f2f ?? 0);
            $async = (int) ($placed[$loading->id]->async ?? 0);
            $needAsync = (int) ($target['async_minutes'] ?? 0);
            if ($target === null || ($f2f === $target['minutes'] && $async === $needAsync)) {
                continue;
            }

            $flags[] = [
                'key' => "shs_blocks:{$loading->id}:{$f2f}:{$async}",
                'type' => 'shs_blocks',
                'severity' => 'amber',
                'message' => "{$loading->subject->name} needs {$target['minutes']} face-to-face minutes ("
                    .self::blocksText($target['sessions'], $target['minutes'])
                    .") and {$needAsync} asynchronous minutes a week; it has {$f2f} face-to-face and {$async} asynchronous.",
                'section_subject_id' => $loading->id,
            ];
        }

        return $flags;
    }

    /** "2 blocks of 120 mins", "1 block of 120 mins". */
    private static function blocksText(int $sessions, int $minutes): string
    {
        $each = intdiv($minutes, max(1, $sessions));

        return $sessions === 1 ? "1 block of {$each} mins" : "{$sessions} blocks of {$each} mins";
    }

    /**
     * Open slots cannot be acknowledged: they must be filled before submitting.
     */
    private function openSlots(Section $section, int $termId): array
    {
        $count = ScheduleEntry::where('term_id', $termId)
            ->where('section_id', $section->id)
            ->where('status', '<>', 'rejected')
            ->whereNull('section_subject_id')
            ->whereNull('activity_id')
            ->count();

        return $count === 0 ? [] : [[
            'key' => 'open_slots',
            'type' => 'open_slots',
            'severity' => 'red',
            'message' => "{$count} open ".($count === 1 ? 'slot is' : 'slots are').' still unfilled.',
            'blocking' => true,
        ]];
    }

    /**
     * Classes imported before the section had a home room. Setting the home room fills them.
     */
    private function noRoom(Section $section, int $termId): array
    {
        $count = ScheduleEntry::where('term_id', $termId)
            ->where('section_id', $section->id)
            ->where('status', '<>', 'rejected')
            ->whereNotNull('section_subject_id')
            ->whereNull('room_id')
            // An asynchronous class needs no room.
            ->where('is_async', false)
            ->count();

        return $count === 0 ? [] : [[
            'key' => 'no_room',
            'type' => 'no_room',
            'severity' => 'red',
            'message' => "{$count} ".($count === 1 ? 'class has' : 'classes have').' no room yet. Set the home room of this section, or choose a room for each class.',
            'blocking' => true,
        ]];
    }

    /**
     * Normally impossible from the plotter. These catch entries left behind when a bell schedule changes.
     */
    private function breaksAndShifts(Section $section, int $termId): array
    {
        $patterns = DayPattern::forSection($section)->with('timeSlots')->get();
        $flags = [];

        $entries = ScheduleEntry::with('teacher')
            ->where('term_id', $termId)
            ->where('section_id', $section->id)
            ->where('status', '<>', 'rejected')
            ->get();

        foreach ($entries as $entry) {
            $when = ScheduleFormat::dayName($entry->day_of_week).' at '.ScheduleFormat::time($entry->start_time);
            $pattern = $patterns->first(fn (DayPattern $item) => in_array($entry->day_of_week, $item->day_numbers));

            $overlapsBreak = $pattern?->timeSlots->contains(fn ($slot) => $slot->is_break
                && $slot->start_time < $entry->end_time
                && $slot->end_time > $entry->start_time);

            if ($overlapsBreak) {
                $flags[] = [
                    'key' => "overlaps_break:{$entry->id}",
                    'type' => 'overlaps_break',
                    'severity' => 'red',
                    'message' => "The entry on {$when} overlaps a break.",
                ];
            }

            if ($pattern && ! $pattern->timeSlots->contains(fn ($slot) => $slot->start_time <= $entry->start_time && $slot->end_time >= $entry->end_time)) {
                $flags[] = [
                    'key' => "outside_shift:{$entry->id}",
                    'type' => 'outside_shift',
                    'severity' => 'red',
                    'message' => "The entry on {$when} is outside the section's bell schedule.",
                ];
            }

            if ($entry->teacher && $this->isOutsideTeacherShift($entry, $section)) {
                $flags[] = [
                    'key' => "teacher_shift:{$entry->id}",
                    'type' => 'teacher_shift',
                    'severity' => 'amber',
                    'message' => "{$entry->teacher->printedName()} has the ".(['AM' => 'morning', 'PM' => 'afternoon', 'PART_TIME' => 'part-time'][$entry->teacher->shift] ?? $entry->teacher->shift)." shift, but teaches on {$when}.",
                ];
            }
        }

        return $flags;
    }

    private function isOutsideTeacherShift(ScheduleEntry $entry, Section $section): bool
    {
        if ($entry->teacher->shift === 'WHOLE_DAY') {
            return false;
        }

        $slots = DayPattern::where('school_year_id', $section->school_year_id)
            ->where('level', $section->gradeLevel->level)
            ->where('shift', $entry->teacher->shift)
            ->get()
            ->filter(fn (DayPattern $pattern) => in_array($entry->day_of_week, $pattern->day_numbers))
            ->flatMap(fn (DayPattern $pattern) => $pattern->timeSlots);

        // No bell schedule for that shift means there is nothing to compare with.
        if ($slots->isEmpty()) {
            return false;
        }

        return $entry->start_time < $slots->min('start_time') || $entry->end_time > $slots->max('end_time');
    }

    /**
     * A teacher of this section who teaches more than 6 hours on a day this section has them
     * (RA 4670; team decision, Nov 21, 2026). Every section of the term counts, both levels.
     */
    private function longTeachingDays(Section $section, int $termId): array
    {
        $limit = (int) config('school.teacher_day_minutes');

        $rows = DB::table('schedule_entries AS e')
            ->join('teachers', 'teachers.id', '=', 'e.teacher_id')
            ->where('e.term_id', $termId)
            ->where('e.status', '<>', 'rejected')
            ->whereExists(fn ($query) => $query->from('schedule_entries AS own')
                ->whereColumn('own.teacher_id', 'e.teacher_id')
                ->whereColumn('own.day_of_week', 'e.day_of_week')
                ->where('own.term_id', $termId)
                ->where('own.section_id', $section->id)
                ->where('own.status', '<>', 'rejected'))
            ->groupBy('e.teacher_id', 'e.day_of_week', 'teachers.first_name', 'teachers.last_name')
            ->havingRaw('SUM(EXTRACT(EPOCH FROM (e.end_time - e.start_time)) / 60) > ?', [$limit])
            ->orderBy('teachers.last_name')
            ->orderBy('e.day_of_week')
            ->selectRaw('e.teacher_id, e.day_of_week, teachers.first_name, teachers.last_name, SUM(EXTRACT(EPOCH FROM (e.end_time - e.start_time)) / 60)::INT AS minutes')
            ->get();

        return $rows->map(fn ($row) => [
            'key' => "teacher_day_hours:{$row->teacher_id}:{$row->day_of_week}:{$row->minutes}",
            'type' => 'teacher_day_hours',
            'severity' => 'amber',
            'message' => "{$row->first_name} {$row->last_name} teaches ".ScheduleFormat::duration((int) $row->minutes).' on '.ScheduleFormat::dayName((int) $row->day_of_week).', more than '.ScheduleFormat::duration($limit).' a day.',
        ])->all();
    }

    private function overloadedTeachers(Section $section, int $termId): array
    {
        $rows = DB::table('teacher_load')
            ->join('section_subjects', function ($join) use ($termId, $section) {
                $join->on('section_subjects.teacher_id', '=', 'teacher_load.teacher_id')
                    ->where('section_subjects.term_id', $termId)
                    ->where('section_subjects.section_id', $section->id);
            })
            ->join('teachers', 'teachers.id', '=', 'teacher_load.teacher_id')
            ->where('teacher_load.term_id', $termId)
            ->where('teacher_load.is_overloaded', true)
            ->select('teachers.id', 'teachers.first_name', 'teachers.last_name', 'teacher_load.subject_count', 'teacher_load.adviser_credit', 'teacher_load.loads', 'teacher_load.max_subjects')
            ->distinct()
            ->get();

        return $rows->map(fn ($row) => [
            'key' => "teacher_overloaded:{$row->id}:{$row->loads}",
            'type' => 'teacher_overloaded',
            'severity' => 'amber',
            // An advisory counts as 1 load (Nov 22, 2026).
            'message' => "Overload: {$row->first_name} {$row->last_name} has {$row->loads} loads ({$row->subject_count} ".($row->subject_count == 1 ? 'subject' : 'subjects')
                .($row->adviser_credit ? ' + 1 advisory' : '').", limit {$row->max_subjects}).",
        ])->all();
    }
}
