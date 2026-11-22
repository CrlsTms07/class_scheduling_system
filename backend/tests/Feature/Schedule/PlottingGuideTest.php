<?php

use App\Models\Section;
use App\Models\SectionSubject;
use App\Models\User;
use App\Services\ConflictService;
use App\Support\Curriculum;
use Database\Seeders\DatabaseSeeder;
use Illuminate\Support\Facades\DB;

/*
 * A clearer plotter (team decisions, Nov 21, 2026): each Junior High subject shows its MATATAG
 * weekly target as a guide, and a teacher over 6 hours on a day is flagged (RA 4670).
 */

beforeEach(function () {
    $this->withHeader('Referer', 'http://localhost:5173');
    $this->seed(DatabaseSeeder::class);
    $this->termId = DB::table('school_terms')->where('is_active', true)->value('id');
    $this->section = Section::where('name', 'Sample A')->first();
    $this->values = SectionSubject::where('section_id', $this->section->id)->whereHas('subject', fn ($q) => $q->where('name', 'Values Education'))->first();
    $this->actingAs(User::where('email', 'admin@deped.gov.ph')->first());
});

function placeHour(object $test, int $day, string $start, string $end): void
{
    DB::table('schedule_entries')->insert([
        'term_id' => $test->termId, 'section_id' => $test->section->id, 'section_subject_id' => $test->values->id,
        'teacher_id' => $test->values->teacher_id, 'room_id' => $test->section->home_room_id, 'day_of_week' => $day,
        'start_time' => $start, 'end_time' => $end, 'created_by' => User::first()->id,
    ]);
}

it('matches a subject to its MATATAG target by name, ignoring case and dashes', function () {
    expect(Curriculum::targetFor('Filipino', 'JHS'))->toBe(['sessions' => 5, 'minutes' => 225])
        ->and(Curriculum::targetFor('tle - ICT', 'JHS'))->toBe(['sessions' => 5, 'minutes' => 225])
        ->and(Curriculum::targetFor('NMP', 'JHS'))->toBe(['sessions' => 4, 'minutes' => 120])
        // Homeroom Guidance: 40 minutes in Junior High, 60 in Senior High (Nov 22, 2026).
        ->and(Curriculum::targetFor('Homeroom Guidance', 'JHS'))->toBe(['sessions' => 1, 'minutes' => 40])
        ->and(Curriculum::targetFor('Homeroom Guidance', 'SHS'))->toBe(['sessions' => 1, 'minutes' => 60, 'async_minutes' => 0])
        ->and(Curriculum::targetFor('Robotics', 'JHS'))->toBeNull()
        // Senior High: every subject has a target, 2 x 120 face-to-face plus 90 asynchronous by default.
        ->and(Curriculum::targetFor('General Mathematics', 'SHS'))->toBe(['sessions' => 2, 'minutes' => 240, 'async_minutes' => 90])
        ->and(Curriculum::targetFor('Effective Communication', 'SHS'))->toBe(['sessions' => 1, 'minutes' => 120, 'async_minutes' => 45])
        // "AP" must not match a name that only starts with the letters.
        ->and(Curriculum::targetFor('Applied Economics', 'JHS'))->toBeNull();
});

it('sends each subject its target and the days it is on the schedule', function () {
    placeHour($this, 1, '07:00', '07:45');
    placeHour($this, 2, '07:00', '07:45');
    placeHour($this, 2, '09:00', '09:45');

    $loading = collect($this->getJson("/api/terms/{$this->termId}/sections/{$this->section->id}/plotter")->assertOk()->json('data.loading'))->keyBy('id');

    expect($loading[$this->values->id]['target'])->toBe(['sessions' => 5, 'minutes' => 225])
        ->and($loading[$this->values->id]['days_placed'])->toBe(2)
        ->and($loading[$this->values->id]['scheduled_minutes'])->toBe(135);
});

it('flags a teacher who teaches more than 6 hours on a day, and not one at exactly 6', function () {
    foreach (['07:00', '08:00', '09:00', '10:00', '11:00', '12:00'] as $start) {
        placeHour($this, 1, $start, date('H:i', strtotime($start) + 3600));
    }
    $flags = fn () => collect($this->getJson("/api/terms/{$this->termId}/sections/{$this->section->id}/plotter")->json('data.flags'))->where('type', 'teacher_day_hours');

    expect($flags())->toHaveCount(0);

    placeHour($this, 1, '13:00', '13:30');

    expect($flags())->toHaveCount(1)
        ->and($flags()->first()['severity'])->toBe('amber')
        ->and($flags()->first()['message'])->toContain('6 hours 30 minutes on Monday');
});

it('puts a free teacher this class would take past 6 hours last, marked, with real hours a week', function () {
    foreach (['07:00', '08:00', '09:00', '10:00', '11:00', '12:00'] as $start) {
        placeHour($this, 1, $start, date('H:i', strtotime($start) + 3600));
    }

    // Only this teacher and one other are active, so both are listed.
    $other = DB::table('teachers')->where('personnel_type', 'teaching')->where('id', '<>', $this->values->teacher_id)->value('id');
    DB::table('teachers')->whereNotIn('id', [$this->values->teacher_id, $other])->update(['is_active' => false]);
    DB::table('teachers')->whereIn('id', [$this->values->teacher_id, $other])->update(['is_active' => true, 'shift' => 'WHOLE_DAY']);

    $teachers = app(ConflictService::class)->availableTeachers($this->termId, $this->section, [1], '15:00', '16:00', 0);
    $busy = collect($teachers)->firstWhere('id', $this->values->teacher_id);

    expect($busy['over_day_limit'])->toBeTrue()
        ->and($busy['hours_per_week'])->toBe(6.0)
        ->and(collect($teachers)->first()['id'])->toBe($other)
        ->and(collect($teachers)->first()['over_day_limit'])->toBeFalse();
});
