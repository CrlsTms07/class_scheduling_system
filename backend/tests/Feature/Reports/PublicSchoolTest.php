<?php

use App\Models\User;
use Database\Seeders\ReferenceDataSeeder;
use Illuminate\Support\Facades\DB;

beforeEach(function () {
    $this->withHeader('Referer', 'http://localhost:5173');
    $this->seed(ReferenceDataSeeder::class);
});

it('shows the school details to anyone, from the built-in defaults at first', function () {
    $this->getJson('/api/public/school')
        ->assertOk()
        ->assertJsonPath('data.school_name', 'Emmanuel Resurreccion Congressional Integrated High School')
        ->assertJsonPath('data.short_name', 'ERCIHS')
        ->assertJsonPath('data.email', '301179@deped.gov.ph')
        ->assertJsonPath('data.has_photo', false);
});

it('shows the phone, email and Facebook page the Admin saved', function () {
    $this->actingAs(User::factory()->create()->assignRole('super_admin'));

    $this->putJson('/api/school-profile', ['phone' => '(046) 111-2222', 'email' => 'office@deped.gov.ph', 'facebook_url' => 'https://www.facebook.com/ercihs'])->assertOk();

    $this->getJson('/api/public/school')
        ->assertJsonPath('data.phone', '(046) 111-2222')
        ->assertJsonPath('data.facebook_url', 'https://www.facebook.com/ercihs')
        ->assertJsonPath('data.school_name', 'Emmanuel Resurreccion Congressional Integrated High School');
});

it('shows the full school name even when an old profile row saved a short one', function () {
    // The live site had "ERCIHS" saved from before the name became fixed (Nov 21, 2026).
    DB::table('school_profile')->insert(['school_name' => 'ERCIHS', 'division' => 'Old division']);

    $this->getJson('/api/public/school')
        ->assertJsonPath('data.school_name', 'Emmanuel Resurreccion Congressional Integrated High School')
        ->assertJsonPath('data.division', config('school.division'));
});
