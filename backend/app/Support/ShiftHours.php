<?php

namespace App\Support;

/**
 * The hours a shift may use (team decision, Nov 22, 2026): in Junior High the morning shift ends by
 * 12:30 PM and the afternoon shift runs from 12:20 PM to 6:30 PM. Kept in config/school.php
 * ('shift_hours'), so the school can change them without code. A shift that is not listed there
 * (like Senior High's) has no limit.
 */
class ShiftHours
{
    private const NAMES = ['AM' => 'morning', 'PM' => 'afternoon', 'WHOLE_DAY' => 'whole-day', 'PART_TIME' => 'part-time'];

    /**
     * @return array{from: string|null, to: string|null, name: string}|null
     */
    public static function window(string $level, string $shift): ?array
    {
        $window = config("school.shift_hours.{$level}.{$shift}");
        if (! is_array($window)) {
            return null;
        }

        return [
            'from' => $window['from'] ?? null,
            'to' => $window['to'] ?? null,
            'name' => self::NAMES[$shift] ?? $shift,
        ];
    }

    /**
     * Why a row from $start to $end does not fit the shift, in plain words, or null.
     */
    public static function problem(string $level, string $shift, string $start, string $end): ?string
    {
        $window = self::window($level, $shift);
        if ($window === null) {
            return null;
        }
        $start = substr($start, 0, 5);
        $end = substr($end, 0, 5);

        if ($window['from'] !== null && $start < $window['from']) {
            return 'The '.$window['name'].' shift starts at '.ScheduleFormat::time($window['from']).', so a row cannot start at '.ScheduleFormat::time($start).'.';
        }
        if ($window['to'] !== null && $end > $window['to']) {
            return 'The '.$window['name'].' shift ends at '.ScheduleFormat::time($window['to']).', so a row cannot end at '.ScheduleFormat::time($end).'.';
        }

        return null;
    }
}
