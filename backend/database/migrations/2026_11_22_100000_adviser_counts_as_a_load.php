<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * An advisory counts as 1 teaching load (team decision, Nov 22, 2026): a teacher's loads in a term
 * are their subject-sections plus 1 when they advise a section of that school year, and they are
 * overloaded past max_subjects (5). The advisory comes from sections.adviser_id, so it can never
 * disagree with the section (no separate "is_adviser" column to keep in step).
 *
 * The first four columns stay as they were; adviser_credit and loads are added at the end.
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::unprepared(<<<'SQL'
CREATE OR REPLACE VIEW teacher_load AS
SELECT t.id AS teacher_id, ss.term_id,
       COUNT(ss.id)                                  AS subject_count,
       t.max_subjects,
       COUNT(ss.id) + adv.credit > t.max_subjects    AS is_overloaded,
       adv.credit                                    AS adviser_credit,
       COUNT(ss.id) + adv.credit                     AS loads
FROM teachers t
JOIN section_subjects ss ON ss.teacher_id = t.id
JOIN school_terms st ON st.id = ss.term_id
CROSS JOIN LATERAL (
    SELECT CASE WHEN EXISTS (
        SELECT 1 FROM sections s WHERE s.adviser_id = t.id AND s.school_year_id = st.school_year_id
    ) THEN 1 ELSE 0 END AS credit
) adv
GROUP BY t.id, ss.term_id, t.max_subjects, adv.credit;
SQL);
    }

    public function down(): void
    {
        DB::unprepared(<<<'SQL'
DROP VIEW IF EXISTS teacher_load;
CREATE VIEW teacher_load AS
SELECT t.id AS teacher_id, ss.term_id,
       COUNT(ss.id)                  AS subject_count,
       t.max_subjects,
       COUNT(ss.id) > t.max_subjects AS is_overloaded
FROM teachers t
JOIN section_subjects ss ON ss.teacher_id = t.id
GROUP BY t.id, ss.term_id, t.max_subjects;
SQL);
    }
};
