<?php

/*
 * The school's public details, shown on the landing page until the Admin fills in
 * Report Settings → School profile. Taken from the school's own website (ercihs.edu.ph).
 */
return [
    'school_name' => 'Emmanuel Resurreccion Congressional Integrated High School',
    'short_name' => 'ERCIHS',
    // The DepEd school ID never changes, so it is not typed (beneficiary review, Nov 21, 2026).
    'school_id' => '301179',
    'address' => 'Poinsettia St., Via Verde Village, Brgy. San Agustin II, City of Dasmariñas, Cavite 4114',
    'phone' => '(046) 894-1463 / (046) 472-9768',
    'email' => '301179@deped.gov.ph',
    'website' => 'https://www.ercihs.edu.ph',
    'facebook_url' => 'https://www.facebook.com/DepEdTayoERCIHS301179',
    'tagline' => 'Honesty · Discipline · Integrity · Perseverance',
    'region' => 'Region IV-A CALABARZON',
    'division' => 'Schools Division of Dasmariñas City',

    // A sign-up whose name matches one personnel record on the Teachers page becomes an active
    // Teacher right away (team decision, Nov 13, 2026). Other roles always wait for the Admin.
    'auto_activate_teachers' => (bool) env('SCHOOL_AUTO_ACTIVATE_TEACHERS', true),

    // Signing in asks for a 6-digit code sent to the DepEd email (team decision, Nov 16, 2026).
    // "auto" turns it on once a real mailer is set (not "log"), so no one is locked out before then.
    'login_code' => env('SCHOOL_LOGIN_CODE', 'auto'),

    // Every teacher carries at most this many subjects, the same for all (team decision, Nov 12, 2026).
    'max_subjects' => (int) env('SCHOOL_MAX_SUBJECTS', 5),
    // Homeroom Guidance is limited to these minutes a week, per department (team decision, Nov 22,
    // 2026): 40 in Junior High, 60 in Senior High. Going over is a red flag.
    'homeroom_minutes' => ['JHS' => 40, 'SHS' => 60],

    // Senior High block schedule (team decision, Nov 22, 2026, from the Master Teacher's class
    // program): 120-minute face-to-face blocks, a recess, a lunch and a 90-minute asynchronous
    // session. "Use the Senior High blocks" on Class Hours and the ShsScheduleSeeder fill a bell
    // schedule with these rows. Change them here, not in the code.
    'shs_blocks' => [
        ['label' => null, 'start_time' => '06:00', 'end_time' => '08:00', 'is_break' => false, 'is_async' => false],
        ['label' => null, 'start_time' => '08:00', 'end_time' => '10:00', 'is_break' => false, 'is_async' => false],
        ['label' => 'Recess', 'start_time' => '10:00', 'end_time' => '10:20', 'is_break' => true, 'is_async' => false],
        ['label' => null, 'start_time' => '10:20', 'end_time' => '12:20', 'is_break' => false, 'is_async' => false],
        ['label' => 'Lunch', 'start_time' => '12:20', 'end_time' => '13:20', 'is_break' => true, 'is_async' => false],
        ['label' => 'Asynchronous session', 'start_time' => '13:20', 'end_time' => '14:50', 'is_break' => false, 'is_async' => true],
    ],
    // A teacher teaches at most 6 hours a day (RA 4670, Magna Carta for Public School Teachers).
    // Going over is saved but flagged in amber (team decision, Nov 21, 2026).
    'teacher_day_minutes' => 360,
    // The hours each Junior High shift may use (team decision, Nov 22, 2026): the class hours and the
    // times typed while plotting must stay inside them. "from" or "to" null means no limit.
    'shift_hours' => [
        'JHS' => [
            'AM' => ['from' => null, 'to' => '12:30'],
            'PM' => ['from' => '12:20', 'to' => '18:30'],
        ],
    ],
];
