<?php

namespace App\Support;

use Illuminate\Support\Facades\DB;

/**
 * The school's details as the forms, emails and home page use them. The system is made for one
 * school (ERCIHS), so its name, school ID, region, division and address are kept in
 * config/school.php and never typed (team decision, Nov 21, 2026, after the beneficiary's review:
 * "the school ID is constant; the tagline and address do not need to be typed"). The Admin only
 * keeps the phone, email and Facebook page up to date; those saved values win over the defaults.
 */
class SchoolProfile
{
    /** What the Admin can change in Report Settings. */
    public const EDITABLE = ['phone', 'email', 'facebook_url'];

    /** Fixed: from config/school.php. */
    public const FIXED = ['school_name', 'school_id', 'region', 'division', 'address', 'website', 'tagline'];

    /**
     * The saved row, with the fixed fields always from config/school.php (an old saved value,
     * like "ERCIHS" for the name, must not show) and empty editable fields filled in from it.
     */
    public static function current(): object
    {
        $saved = (array) (DB::table('school_profile')->first() ?? []);
        $defaults = config('school');

        $profile = $saved;
        foreach (self::FIXED as $field) {
            $profile[$field] = $defaults[$field] ?? null;
        }
        foreach (self::EDITABLE as $field) {
            $profile[$field] = filled($saved[$field] ?? null) ? $saved[$field] : ($defaults[$field] ?? null);
        }

        return (object) $profile;
    }

    /** The DepEd seal, printed at the top of every form (Nov 22, 2026), as an embedded image. */
    public static function depedSealDataUri(): string
    {
        return 'data:image/png;base64,'.base64_encode((string) file_get_contents(resource_path('images/deped-seal.png')));
    }

    /** The school's logo, built into the system (it does not change), as an embedded image. */
    public static function logoDataUri(): string
    {
        return 'data:image/png;base64,'.base64_encode((string) file_get_contents(resource_path('images/ercihs-logo.png')));
    }
}
