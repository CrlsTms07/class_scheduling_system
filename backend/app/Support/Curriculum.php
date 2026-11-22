<?php

namespace App\Support;

/**
 * The weekly target of a subject from config/curriculum.php, matched by name (case, dots and
 * dashes ignored). "TLE - ICT" matches "TLE".
 *
 * Junior High: a guide only; a name that is not listed has no target.
 * Senior High: every subject has one (a listed name, or SHS_DEFAULT), with F2F and asynchronous
 * minutes, and it is checked (FlagService).
 */
class Curriculum
{
    /**
     * @return array{sessions: int, minutes: int, async_minutes?: int}|null
     */
    public static function targetFor(string $subjectName, string $level): ?array
    {
        $name = self::normalize($subjectName);

        foreach (config("curriculum.{$level}", []) as $row) {
            foreach ($row['names'] as $alias) {
                $alias = self::normalize($alias);
                if ($name === $alias || str_starts_with($name, $alias.' ')) {
                    return self::target($row, $level);
                }
            }
        }

        $default = config("curriculum.{$level}_DEFAULT");

        return $default ? self::target($default, $level) : null;
    }

    /** The most minutes a week of Homeroom Guidance in a department: 40 (JHS) or 60 (SHS). */
    public static function homeroomMinutes(string $level): int
    {
        $limits = config('school.homeroom_minutes');

        return (int) (is_array($limits) ? ($limits[$level] ?? max($limits)) : $limits);
    }

    /**
     * @param  array<string, mixed>  $row
     * @return array{sessions: int, minutes: int, async_minutes?: int}
     */
    private static function target(array $row, string $level): array
    {
        $target = [
            'sessions' => (int) $row['sessions'],
            'minutes' => (int) ($row['minutes'] ?? self::homeroomMinutes($level)),
        ];

        if (array_key_exists('async_minutes', $row)) {
            $target['async_minutes'] = (int) $row['async_minutes'];
        }

        return $target;
    }

    private static function normalize(string $name): string
    {
        $name = mb_strtolower($name);
        $name = preg_replace('/[^\p{L}\p{N}]+/u', ' ', $name);

        return trim(preg_replace('/\s+/', ' ', $name));
    }
}
