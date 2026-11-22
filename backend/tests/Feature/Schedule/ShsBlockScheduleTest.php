<?php

use App\Models\SchoolTerm;
use App\Models\Section;
use App\Models\SectionSubject;
use App\Models\User;
use Database\Seeders\DatabaseSeeder;
use Database\Seeders\ShsScheduleSeeder;
use Illuminate\Support\Facades\DB;

/*
 * Senior High block schedule (team decision, Nov 22, 2026, from the Master Teacher's class program):
 * 120-minute face-to-face blocks, a recess, a lunch and a 90-minute asynchronous session; each
 * subject needs 2 F2F blocks and 90 asynchronous minutes a week (Homeroom: at most 60 minutes).
 */

beforeEach(function () {
    $this->withHeader('Referer', 'http://localhost:5173');
    $this->seed(DatabaseSeeder::class);
    $this->term = SchoolTerm::where('is_active', true)->first();
    $this->yearId = $this->term->school_year_id;
    $this->grade11 = DB::table('grade_levels')->where('grade', 11)->value('id');
    // Start each test with no Senior High bell schedule and none of the seeded Grade 11 subjects.
    DB::table('day_patterns')->where('school_year_id', $this->yearId)->where('level', 'SHS')->delete();

    $this->master = User::factory()->create()->assignRole('master_teacher');
    $this->master->gradeLevels()->sync([$this->grade11]);
    $this->actingAs($this->master);
});

function shsPattern(object $test): int
{
    return DB::table('day_patterns')->insertGetId([
        'school_year_id' => $test->yearId, 'level' => 'SHS', 'shift' => 'WHOLE_DAY', 'name' => 'Blocks', 'days' => '{1,2,3,4,5}',
    ]);
}

describe('the ShsScheduleSeeder', function () {
    it('adds the Senior High blocks and the Grade 11 subjects, and adds nothing the second time', function () {
        $this->seed(ShsScheduleSeeder::class);

        $pattern = DB::table('day_patterns')->where('school_year_id', $this->yearId)->where('level', 'SHS')->where('name', 'Monday – Friday')->first();
        $slots = DB::table('time_slots')->where('day_pattern_id', $pattern->id)->orderBy('start_time')->get();

        expect($slots->map(fn ($slot) => substr($slot->start_time, 0, 5).'-'.substr($slot->end_time, 0, 5))->all())
            ->toBe(['06:00-08:00', '08:00-10:00', '10:00-10:20', '10:20-12:20', '12:20-13:20', '13:20-14:50'])
            ->and($slots->where('is_break', true)->pluck('label')->all())->toBe(['Recess', 'Lunch'])
            ->and($slots->where('is_async', true)->count())->toBe(1)
            ->and($slots->last()->is_async)->toBeTrue()
            ->and($slots->whereNotNull('period_no')->pluck('period_no')->all())->toBe([1, 2, 3, 4])
            ->and(DB::table('subjects')->where('school_year_id', $this->yearId)->where('name', 'General Mathematics')->value('level'))->toBe('SHS')
            ->and(DB::table('subjects')->where('school_year_id', $this->yearId)->where('name', 'Mabisang Komunikasyon')->value('code'))->toBe('MAB-KOM')
            // A name already in the year (like the demo's Homeroom Guidance) is not added again.
            ->and(DB::table('subjects')->where('school_year_id', $this->yearId)->whereRaw('LOWER(name) = ?', ['homeroom guidance'])->count())->toBe(1);

        $slotCount = DB::table('time_slots')->count();
        $subjectCount = DB::table('subjects')->count();
        $this->seed(ShsScheduleSeeder::class);

        expect(DB::table('time_slots')->count())->toBe($slotCount)
            ->and(DB::table('subjects')->count())->toBe($subjectCount);
    });

    it('leaves a Senior High bell schedule that is already there alone', function () {
        $pattern = shsPattern($this);
        DB::table('time_slots')->insert(['day_pattern_id' => $pattern, 'period_no' => 1, 'start_time' => '07:00', 'end_time' => '08:00']);

        $this->seed(ShsScheduleSeeder::class);

        expect(DB::table('day_patterns')->where('school_year_id', $this->yearId)->where('level', 'SHS')->count())->toBe(1)
            ->and(DB::table('time_slots')->where('day_pattern_id', $pattern)->count())->toBe(1);
    });
});

describe('"Use the Senior High blocks" on Class Hours', function () {
    it('fills an empty Senior High bell schedule with the blocks from the config', function () {
        $pattern = shsPattern($this);

        $this->postJson("/api/day-patterns/{$pattern}/slots/preset", ['preset' => 'shs_blocks'])->assertCreated();

        expect(DB::table('time_slots')->where('day_pattern_id', $pattern)->count())->toBe(6)
            ->and(DB::table('time_slots')->where('day_pattern_id', $pattern)->where('is_async', true)->value('start_time'))->toStartWith('13:20');
    });

    it('is for Senior High only', function () {
        $admin = User::factory()->create()->assignRole('super_admin');
        $jhs = DB::table('day_patterns')->insertGetId([
            'school_year_id' => $this->yearId, 'level' => 'JHS', 'shift' => 'WHOLE_DAY', 'name' => 'Empty JHS', 'days' => '{1}',
        ]);

        $this->actingAs($admin)->postJson("/api/day-patterns/{$jhs}/slots/preset", ['preset' => 'shs_blocks'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['slots' => 'Senior High bell schedules only']);
    });
});

describe('the weekly minutes of a Senior High subject', function () {
    beforeEach(function () {
        $pattern = shsPattern($this);
        $this->blockA = DB::table('time_slots')->insertGetId(['day_pattern_id' => $pattern, 'period_no' => 1, 'start_time' => '06:00', 'end_time' => '08:00']);
        $this->async = DB::table('time_slots')->insertGetId(['day_pattern_id' => $pattern, 'period_no' => 2, 'start_time' => '13:20', 'end_time' => '14:50', 'is_async' => true]);
        $this->section = Section::create(['school_year_id' => $this->yearId, 'grade_level_id' => $this->grade11, 'name' => 'Block 11-A', 'adviser_id' => DB::table('teachers')->insertGetId(['first_name' => 'Ada', 'last_name' => 'Adviser'])]);
        $subject = DB::table('subjects')->insertGetId(['school_year_id' => $this->yearId, 'level' => 'SHS', 'name' => 'General Mathematics Block']);
        $teacher = DB::table('teachers')->insertGetId(['first_name' => 'Juan', 'last_name' => 'Reyes']);
        $this->loading = SectionSubject::create(['term_id' => $this->term->id, 'section_id' => $this->section->id, 'subject_id' => $subject, 'teacher_id' => $teacher]);
        $this->room = DB::table('rooms')->value('id');
    });

    function placeBlock(object $test, int $slotId, int $day): void
    {
        $test->putJson("/api/terms/{$test->term->id}/sections/{$test->section->id}/slots/{$slotId}", [
            'section_subject_id' => $test->loading->id, 'room_id' => $test->room, 'days' => [$day],
        ])->assertOk();
    }

    function blockFlag(object $test): ?array
    {
        $data = $test->getJson("/api/terms/{$test->term->id}/sections/{$test->section->id}/plotter")->json('data');

        return collect($data['flags'])->firstWhere('type', 'shs_blocks');
    }

    it('flags a subject with 1 block of 2 and no asynchronous session, saying what is missing', function () {
        placeBlock($this, $this->blockA, 1);

        $flag = blockFlag($this);
        expect($flag['severity'])->toBe('amber')
            ->and($flag['message'])->toBe('General Mathematics Block needs 240 face-to-face minutes (2 blocks of 120 mins) and 90 asynchronous minutes a week; it has 120 face-to-face and 0 asynchronous.');
    });

    it('is satisfied by 2 blocks on 2 days and the asynchronous session, and shows them apart', function () {
        placeBlock($this, $this->blockA, 1);
        placeBlock($this, $this->blockA, 3);
        placeBlock($this, $this->async, 5);

        expect(blockFlag($this))->toBeNull();

        $loading = collect($this->getJson("/api/terms/{$this->term->id}/sections/{$this->section->id}/plotter")->json('data.loading'))->first();
        expect($loading['days_placed'])->toBe(2)
            ->and($loading['scheduled_async_minutes'])->toBe(90)
            ->and($loading['target'])->toBe(['sessions' => 2, 'minutes' => 240, 'async_minutes' => 90]);
    });

    it('puts Homeroom Guidance in the first 60 minutes of a 120-minute block, like the class program', function () {
        DB::table('subjects')->where('id', $this->loading->subject_id)->update(['name' => 'Homeroom Guidance']);

        placeBlock($this, $this->blockA, 1);

        $entry = DB::table('schedule_entries')->where('section_subject_id', $this->loading->id)->first();
        expect(substr($entry->start_time, 0, 5))->toBe('06:00')
            ->and(substr($entry->end_time, 0, 5))->toBe('07:00');

        $data = $this->getJson("/api/terms/{$this->term->id}/sections/{$this->section->id}/plotter")->json('data');
        expect(collect($data['flags'])->whereIn('type', ['minutes_over', 'shs_blocks'])->all())->toBe([])
            ->and($data['loading'][0]['required_minutes'])->toBe(60)
            ->and($data['loading'][0]['scheduled_minutes'])->toBe(60)
            // It still shows in the 6:00 row of the grid.
            ->and($data['entries'][0]['start_time'])->toStartWith('06:00');

    });

    it('moves a Homeroom class to another block and still takes only 60 minutes there', function () {
        DB::table('subjects')->where('id', $this->loading->subject_id)->update(['name' => 'Homeroom Guidance']);
        placeBlock($this, $this->blockA, 1);

        $this->postJson("/api/terms/{$this->term->id}/sections/{$this->section->id}/slots/{$this->blockA}/move", [
            'from_slot_id' => $this->blockA, 'from_days' => [1], 'days' => [2],
        ])->assertOk();

        $entry = DB::table('schedule_entries')->where('section_subject_id', $this->loading->id)->first();
        expect(substr($entry->end_time, 0, 5))->toBe('07:00');
    });
});
