<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

/**
 * Looks for records that need fixing before the evaluation (Nov 22, 2026): duplicates, sections
 * without an adviser or room, overlapping bell schedules, schedule entries that point nowhere, and
 * the like. It only reads, so it is safe on the live database (set DB_URL first). Each finding says
 * which page fixes it.
 */
class CheckData extends Command
{
    protected $signature = 'app:check-data';

    protected $description = 'Check the records for duplicates and missing details (read only)';

    public function handle(): int
    {
        $this->info('Database: '.DB::connection()->getDatabaseName());

        $problems = 0;
        foreach ($this->checks() as [$title, $sql, $fix]) {
            $rows = DB::select($sql);
            if ($rows === []) {
                $this->line("  OK  {$title}");

                continue;
            }

            $problems++;
            $this->warn("  !!  {$title}: ".count($rows));
            $this->table(array_keys((array) $rows[0]), array_map(fn ($row) => (array) $row, array_slice($rows, 0, 10)));
            $this->line("      Fix: {$fix}");
        }

        $problems === 0 ? $this->info('No problems found.') : $this->warn("{$problems} kind(s) of problem found. Nothing was changed.");

        return self::SUCCESS;
    }

    /**
     * @return list<array{0: string, 1: string, 2: string}>
     */
    private function checks(): array
    {
        return [
            ['Exactly one active term', "SELECT COUNT(*) AS active FROM school_terms WHERE is_active HAVING COUNT(*) <> 1",
                'School Years page: make one term active.'],
            ['Teachers with the same name', "SELECT LOWER(TRIM(first_name)) || ' ' || LOWER(TRIM(last_name)) AS name, COUNT(*) AS records, STRING_AGG(id::text, ', ') AS ids FROM teachers GROUP BY 1 HAVING COUNT(*) > 1",
                'Teachers page: keep one record and delete or rename the others.'],
            ['Subjects with the same name in a school year', 'SELECT school_year_id, level, LOWER(TRIM(name)) AS name, COUNT(*) AS records, STRING_AGG(id::text, \', \') AS ids FROM subjects GROUP BY 1, 2, 3 HAVING COUNT(*) > 1',
                'Subjects & Class Hours page: delete the extra subject.'],
            ['Buildings with the same name', 'SELECT LOWER(TRIM(name)) AS name, COUNT(*) AS records, STRING_AGG(id::text, \', \') AS ids FROM buildings GROUP BY 1 HAVING COUNT(*) > 1',
                'Rooms & Buildings page: move the rooms to one building and delete the other.'],
            ['Sections with the same name in a grade', 'SELECT school_year_id, grade_level_id, LOWER(TRIM(name)) AS name, COUNT(*) AS records FROM sections GROUP BY 1, 2, 3 HAVING COUNT(*) > 1',
                'Sections page: rename or delete the extra section.'],
            ['Sections of the active year without an adviser or room', 'SELECT s.id, s.name, s.adviser_id, s.home_room_id FROM sections s JOIN school_terms t ON t.school_year_id = s.school_year_id AND t.is_active WHERE s.adviser_id IS NULL OR s.home_room_id IS NULL',
                'Sections page: edit the section and choose the adviser and room (both required since Nov 21, 2026).'],
            ['Bell schedules sharing a day', 'SELECT a.id AS first_id, a.name AS first, b.id AS second_id, b.name AS second, a.level, a.shift FROM day_patterns a JOIN day_patterns b ON a.id < b.id AND a.school_year_id = b.school_year_id AND a.level = b.level AND a.shift = b.shift AND a.days && b.days',
                'Class Hours page: remove the day from one of the bell schedules.'],
            ['Periods that overlap in a bell schedule', 'SELECT a.day_pattern_id, a.id AS first_id, b.id AS second_id, a.start_time, a.end_time, b.start_time AS second_start FROM time_slots a JOIN time_slots b ON a.day_pattern_id = b.day_pattern_id AND a.id < b.id AND a.start_time < b.end_time AND b.start_time < a.end_time',
                'Class Hours page: change or delete one of the periods.'],
            ['Bell schedules with no periods', 'SELECT p.id, p.name, p.level, p.shift FROM day_patterns p WHERE NOT EXISTS (SELECT 1 FROM time_slots t WHERE t.day_pattern_id = p.id)',
                'Class Hours page: add periods, or press "Use the Senior High blocks" on a Senior High one.'],
            ['Classes whose teacher differs from Teacher Loading', 'SELECT e.id, e.term_id, e.day_of_week, e.start_time, e.teacher_id, s.teacher_id AS loading_teacher_id FROM schedule_entries e JOIN section_subjects s ON s.id = e.section_subject_id WHERE e.teacher_id IS DISTINCT FROM s.teacher_id',
                'Schedule page: open the section and choose the teacher again for that class.'],
            ['Active accounts without a role', "SELECT u.id, u.email FROM users u WHERE u.status = 'active' AND NOT EXISTS (SELECT 1 FROM model_has_roles r WHERE r.model_id = u.id AND r.model_type = 'App\\Models\\User')",
                'Users page: change access and choose a role.'],
            ['Accounts without a DepEd email', "SELECT id, email, status FROM users WHERE email NOT ILIKE '%@deped.gov.ph'",
                'Users page: delete or decline the account (only @deped.gov.ph emails may sign in).'],
            ['Overloaded teachers (subjects + 1 for an advisory, over the limit)', 'SELECT * FROM teacher_load WHERE is_overloaded',
                'Teacher Loading page: give one of the subjects to another teacher.'],
        ];
    }
}
