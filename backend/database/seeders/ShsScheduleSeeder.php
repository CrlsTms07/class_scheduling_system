<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

/**
 * Senior High block schedule and Grade 11 subjects (team decision, Nov 22, 2026, from the Master
 * Teacher's class program), for the school year of the active term.
 *
 *   php artisan db:seed --class=ShsScheduleSeeder
 *
 * Safe to run again and on a database with real records: it only adds what is missing and never
 * changes or deletes anything. The block times come from config/school.php ("shs_blocks"); the
 * weekly minutes of each subject (2 x 120 face-to-face + 90 asynchronous, Homeroom 60) come from
 * config/curriculum.php, since subjects are names only (Nov 21, 2026).
 */
class ShsScheduleSeeder extends Seeder
{
    /** The Grade 11 subjects of the class program. Homeroom Guidance is a priority subject. */
    private const SUBJECTS = [
        ['code' => 'GEN-SCI', 'name' => 'General Science'],
        ['code' => 'GEN-MATH', 'name' => 'General Mathematics'],
        ['code' => 'LCS', 'name' => 'Life and Career Skills'],
        ['code' => 'KASAYSAYAN', 'name' => 'Pag-aaral ng Kasaysayan'],
        ['code' => 'SOC-SCI', 'name' => 'Social Science in Theory and Practice'],
        ['code' => 'EFF-COMM', 'name' => 'Effective Communication'],
        ['code' => 'MAB-KOM', 'name' => 'Mabisang Komunikasyon'],
        ['code' => 'HG-11', 'name' => 'Homeroom Guidance'],
    ];

    private const PATTERN_NAME = 'Monday – Friday';

    private const DAYS = [1, 2, 3, 4, 5];

    public function run(): void
    {
        $yearId = DB::table('school_terms')->where('is_active', true)->value('school_year_id');
        if (! $yearId) {
            $this->command?->warn('No active term yet: start a school year first, then run this seeder again.');

            return;
        }

        DB::transaction(function () use ($yearId) {
            $this->blocks($yearId);
            $this->subjects($yearId);
        });
    }

    /**
     * A whole-day Senior High bell schedule, Monday to Friday, with the blocks. Skipped when such a
     * bell schedule already has periods, or another one already has these days.
     */
    private function blocks(int $yearId): void
    {
        $pattern = DB::table('day_patterns')
            ->where(['school_year_id' => $yearId, 'level' => 'SHS', 'shift' => 'WHOLE_DAY', 'name' => self::PATTERN_NAME])
            ->first();

        if (! $pattern) {
            $taken = DB::table('day_patterns')
                ->where(['school_year_id' => $yearId, 'level' => 'SHS', 'shift' => 'WHOLE_DAY'])
                ->get()
                ->contains(fn ($other) => array_intersect(self::DAYS, array_map('intval', explode(',', trim($other->days, '{}')))) !== []);
            if ($taken) {
                $this->command?->warn('Senior High (whole day) already has a bell schedule for some of Monday to Friday: the blocks were not added. Use "Use the Senior High blocks" on Class Hours for an empty one.');

                return;
            }

            $patternId = DB::table('day_patterns')->insertGetId([
                'school_year_id' => $yearId,
                'level' => 'SHS',
                'shift' => 'WHOLE_DAY',
                'name' => self::PATTERN_NAME,
                'days' => '{'.implode(',', self::DAYS).'}',
            ]);
        } else {
            $patternId = $pattern->id;
            if (DB::table('time_slots')->where('day_pattern_id', $patternId)->exists()) {
                $this->command?->info('The Senior High bell schedule already has periods: left as it is.');

                return;
            }
        }

        $period = 0;
        foreach (config('school.shs_blocks') as $row) {
            DB::table('time_slots')->insert([
                'day_pattern_id' => $patternId,
                'period_no' => $row['is_break'] ? null : ++$period,
                'label' => $row['label'],
                'start_time' => $row['start_time'],
                'end_time' => $row['end_time'],
                'is_break' => $row['is_break'],
                'is_async' => $row['is_async'],
            ]);
        }

        $this->command?->info('Added the Senior High blocks (Monday – Friday, whole day).');
    }

    /** The Grade 11 subjects, as Senior High subjects of the year. Existing names are left as they are. */
    private function subjects(int $yearId): void
    {
        $added = 0;
        foreach (self::SUBJECTS as $subject) {
            $exists = DB::table('subjects')
                ->where('school_year_id', $yearId)
                ->whereRaw('LOWER(name) = LOWER(?)', [$subject['name']])
                ->where(fn ($query) => $query->where('level', 'SHS')->orWhereNull('level'))
                ->exists();
            if ($exists) {
                continue;
            }

            DB::table('subjects')->insert([
                'school_year_id' => $yearId,
                'level' => 'SHS',
                'code' => $subject['code'],
                'name' => $subject['name'],
                'subject_type' => 'core',
                'is_priority' => str_contains(strtolower($subject['name']), 'homeroom'),
                'is_active' => true,
            ]);
            $added++;
        }

        $this->command?->info("Added {$added} Grade 11 subjects (".(count(self::SUBJECTS) - $added).' were already there).');
    }
}
