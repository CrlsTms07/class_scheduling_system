<?php

use Database\Seeders\DatabaseSeeder;
use Illuminate\Support\Facades\DB;

beforeEach(function () {
    $this->seed(DatabaseSeeder::class);
});

it('reads the records and changes nothing', function () {
    $before = DB::table('teachers')->count();

    $this->artisan('app:check-data')->assertSuccessful()->expectsOutputToContain('Exactly one active term');

    expect(DB::table('teachers')->count())->toBe($before);
});

it('reports teachers with the same name and says which page fixes it', function () {
    DB::table('teachers')->insert([['first_name' => 'Twin', 'last_name' => 'Cruz'], ['first_name' => 'twin ', 'last_name' => 'CRUZ']]);

    $this->artisan('app:check-data')
        ->assertSuccessful()
        ->expectsOutputToContain('Teachers with the same name: 1')
        ->expectsOutputToContain('Teachers page: keep one record');
});
