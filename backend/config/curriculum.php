<?php

/*
 * Weekly targets of the Junior High subjects (MATATAG curriculum), shown in the plotter as a guide:
 * "3 of 5 days · 135 of 225 mins" (team decision, Nov 21, 2026). They are not typed by the users and
 * they are not a flag: subjects stay names only (beneficiary review, Nov 21, 2026), and a subject
 * whose name is not listed here just shows its minutes. A subject is complete when it is on the
 * schedule on as many days as its sessions, so a shorter Friday period still counts.
 *
 * Senior High (team decision, Nov 22, 2026, from the Master Teacher's class program): a subject
 * takes face-to-face (F2F) blocks on different days plus an asynchronous session. Unlike Junior
 * High, these ARE checked: a Senior High subject whose F2F or asynchronous minutes differ from its
 * target is flagged in amber (to fix or acknowledge before submitting). "minutes" are the F2F
 * minutes; "async_minutes" the asynchronous ones. A subject not listed takes SHS_DEFAULT.
 *
 * Change this file, not the code, when DepEd changes the time allotment.
 */
return [
    'JHS' => [
        ['names' => ['Filipino'], 'sessions' => 5, 'minutes' => 225],
        ['names' => ['English'], 'sessions' => 5, 'minutes' => 225],
        ['names' => ['Mathematics', 'Math'], 'sessions' => 5, 'minutes' => 225],
        ['names' => ['Science'], 'sessions' => 5, 'minutes' => 225],
        ['names' => ['Araling Panlipunan', 'AP'], 'sessions' => 5, 'minutes' => 225],
        ['names' => ['MAPEH'], 'sessions' => 5, 'minutes' => 225],
        ['names' => ['Values Education', 'VE', 'GMRC', 'Edukasyon sa Pagpapakatao', 'EsP'], 'sessions' => 5, 'minutes' => 225],
        ['names' => ['TLE', 'EPP', 'Technology and Livelihood Education'], 'sessions' => 5, 'minutes' => 225],
        ['names' => ['National Mathematics Program', 'NMP'], 'sessions' => 4, 'minutes' => 120],
        // Homeroom Guidance: once a week; its minutes are the Homeroom limit (config/school.php).
        ['names' => ['Homeroom Guidance', 'Homeroom Guidance Program', 'HGP', 'Homeroom'], 'sessions' => 1, 'minutes' => null],
    ],

    'SHS' => [
        // Paired subjects: one F2F block each, sharing the asynchronous time.
        ['names' => ['Effective Communication'], 'sessions' => 1, 'minutes' => 120, 'async_minutes' => 45],
        ['names' => ['Mabisang Komunikasyon'], 'sessions' => 1, 'minutes' => 120, 'async_minutes' => 45],
        // Homeroom Guidance: once a week, no asynchronous session; minutes from config/school.php.
        ['names' => ['Homeroom Guidance', 'Homeroom Guidance Program', 'HGP', 'Homeroom'], 'sessions' => 1, 'minutes' => null, 'async_minutes' => 0],
    ],

    // Every other Senior High subject: 2 F2F blocks of 120 minutes on 2 days, plus a 90-minute
    // asynchronous session (330 minutes a week).
    'SHS_DEFAULT' => ['sessions' => 2, 'minutes' => 240, 'async_minutes' => 90],
];
