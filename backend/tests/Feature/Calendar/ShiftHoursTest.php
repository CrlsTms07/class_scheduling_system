<?php

use App\Models\Section;
use App\Models\User;
use Database\Seeders\ReferenceDataSeeder;
use Illuminate\Support\Facades\DB;

/*
 * Junior High shift hours (team decision, Nov 22, 2026): the morning shift ends by 12:30 PM, the
 * afternoon shift runs from 12:20 PM to 6:30 PM. Senior High has no such limit.
 */

beforeEach(function () {
    $this->withHeader('Referer', 'http://localhost:5173');
    $this->seed(ReferenceDataSeeder::class);
    $this->actingAs(User::factory()->create()->assignRole('super_admin'));

    $this->yearId = DB::table('school_years')->insertGetId(['name' => '2026-2027', 'start_date' => '2026-06-01', 'end_date' => '2027-03-31']);
    $this->termId = DB::table('school_terms')->insertGetId([
        'school_year_id' => $this->yearId, 'term_no' => 1, 'name' => 'First Term',
        'start_date' => '2026-06-01', 'end_date' => '2026-09-30', 'is_active' => true,
    ]);
    $newPattern = fn (string $level, string $shift) => DB::table('day_patterns')->insertGetId([
        'school_year_id' => $this->yearId, 'level' => $level, 'shift' => $shift, 'name' => 'Friday', 'days' => '{5}',
    ]);
    $this->morning = $newPattern('JHS', 'AM');
    $this->afternoon = $newPattern('JHS', 'PM');
    $this->senior = $newPattern('SHS', 'AM');
});

function shiftRow(string $start, string $end): array
{
    return ['is_break' => false, 'label' => null, 'start_time' => $start, 'end_time' => $end];
}

it('keeps a morning period from ending after 12:30 PM, and allows one that ends at 12:30', function () {
    $this->postJson("/api/day-patterns/{$this->morning}/slots", shiftRow('11:45', '12:45'))
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['end_time' => 'The morning shift ends at 12:30 PM, so a row cannot end at 12:45 PM.']);

    $this->postJson("/api/day-patterns/{$this->morning}/slots", shiftRow('11:45', '12:30'))->assertCreated();
});

it('keeps an afternoon period between 12:20 PM and 6:30 PM', function () {
    $this->postJson("/api/day-patterns/{$this->afternoon}/slots", shiftRow('12:00', '12:40'))
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['start_time' => 'starts at 12:20 PM']);
    $this->postJson("/api/day-patterns/{$this->afternoon}/slots", shiftRow('18:00', '18:40'))
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['end_time' => 'ends at 6:30 PM']);

    $this->postJson("/api/day-patterns/{$this->afternoon}/slots", shiftRow('12:20', '13:00'))->assertCreated();
    $this->postJson("/api/day-patterns/{$this->afternoon}/slots", shiftRow('17:50', '18:30'))->assertCreated();
});

it('refuses a preset that runs past the shift, and sends the hours with the bell schedule', function () {
    $rows = [shiftRow('11:00', '11:45'), shiftRow('11:45', '12:30'), shiftRow('12:30', '13:15')];

    $this->postJson("/api/day-patterns/{$this->morning}/slots/preset", ['slots' => $rows])
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['slots' => 'cannot end at 1:15 PM']);
    expect(DB::table('time_slots')->count())->toBe(0);

    $patterns = collect($this->getJson("/api/school-years/{$this->yearId}/day-patterns")->assertOk()->json('data'))->keyBy('id');
    expect($patterns[$this->morning]['shift_window'])->toBe(['from' => null, 'to' => '12:30', 'name' => 'morning'])
        ->and($patterns[$this->senior]['shift_window'])->toBeNull();
});

it('leaves Senior High without these limits', function () {
    $this->postJson("/api/day-patterns/{$this->senior}/slots", shiftRow('13:00', '14:00'))->assertCreated();
});

it('refuses a time typed while plotting that runs past a morning section shift', function () {
    $grade7 = DB::table('grade_levels')->where('grade', 7)->value('id');
    $section = Section::create(['school_year_id' => $this->yearId, 'grade_level_id' => $grade7, 'name' => 'Honesty', 'shift' => 'AM']);

    $this->postJson("/api/terms/{$this->termId}/sections/{$section->id}/periods", ['days' => [5], 'start_time' => '12:00', 'end_time' => '12:45'])
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['end_time' => 'ends at 12:30 PM']);
});
