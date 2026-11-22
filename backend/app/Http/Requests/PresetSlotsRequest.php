<?php

namespace App\Http\Requests;

use App\Models\DayPattern;
use App\Support\ShiftHours;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Validator;

/**
 * A whole bell schedule at once, from a preset (8, 10, 14 or 16 rows), or the Senior High blocks
 * ("preset": "shs_blocks", rows from config/school.php, Nov 22, 2026). Only for a bell schedule
 * that has no periods yet, so nothing already plotted can change.
 */
class PresetSlotsRequest extends FormRequest
{
    public function authorize(): bool
    {
        $pattern = $this->route('dayPattern') ?? $this->route('timeSlot')?->dayPattern;

        return $this->user()->can('manage', [DayPattern::class, $pattern?->level]);
    }

    /** The Senior High blocks are read from the config, so they are written in one place only. */
    protected function prepareForValidation(): void
    {
        if ($this->input('preset') === 'shs_blocks') {
            $this->merge(['slots' => config('school.shs_blocks')]);
        }
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'preset' => ['nullable', 'in:shs_blocks'],
            'slots' => ['required', 'array', 'min:1', 'max:20'],
            'slots.*.is_async' => ['sometimes', 'boolean'],
            'slots.*.is_break' => ['required', 'boolean'],
            'slots.*.label' => ['nullable', 'string', 'max:40'],
            'slots.*.start_time' => ['required', 'date_format:H:i'],
            'slots.*.end_time' => ['required', 'date_format:H:i'],
        ];
    }

    public function after(): array
    {
        return [function (Validator $validator) {
            if ($validator->errors()->isNotEmpty()) {
                return;
            }

            if ($this->route('dayPattern')->timeSlots()->exists()) {
                $validator->errors()->add('slots', 'This bell schedule already has periods. A preset is only for an empty one.');

                return;
            }

            if ($this->route('dayPattern')->level !== 'SHS' && collect($this->input('slots'))->contains(fn ($slot) => ! empty($slot['is_async']))) {
                $validator->errors()->add('slots', 'Asynchronous sessions and the Senior High blocks are for Senior High bell schedules only.');

                return;
            }

            $previousEnd = '00:00';

            foreach ($this->input('slots') as $index => $slot) {
                if ($slot['end_time'] <= $slot['start_time']) {
                    $validator->errors()->add("slots.{$index}.end_time", 'Each row must end after it starts.');
                }
                if ($slot['start_time'] < $previousEnd) {
                    $validator->errors()->add("slots.{$index}.start_time", 'Rows must follow each other without overlapping.');
                }
                if ($slot['is_break'] && blank($slot['label'] ?? null)) {
                    $validator->errors()->add("slots.{$index}.label", 'Name each break, like Recess or Lunch.');
                }

                $previousEnd = $slot['end_time'];
            }

            // Inside the hours of the shift (Junior High, Nov 22, 2026): said once, for the first row out.
            $pattern = $this->route('dayPattern');
            foreach ($this->input('slots') as $slot) {
                $problem = ShiftHours::problem($pattern->level, $pattern->shift, $slot['start_time'], $slot['end_time']);
                if ($problem !== null) {
                    $validator->errors()->add('slots', $problem.' Use fewer rows, shorter periods or an earlier start.');
                    break;
                }
            }
        }];
    }
}
