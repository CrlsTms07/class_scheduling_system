// @ts-check
/**
 * "+ Add a subject" from the class dialog: gives the section a subject with its teacher, saved in
 * Teacher Loading (the same API and rules, like "Full load" on a 6th subject), without leaving the
 * plotter (team decision, Nov 21, 2026).
 */
import { assignTeacher, getSectionLoading, teacherHint } from "@/api/teacher-loading.js";
import { openFormDialog } from "@/components/form-dialog.js";
import { toast } from "@/components/toast.js";
import { termState } from "@/state/term.js";

/**
 * Opens the form. When a subject is added, onAdded gets its subject id after the form closes.
 * @param {{ termId: number, section: { id: number, label: string }, onAdded: (subjectId: number) => void, onNoneLeft: (message: string) => void }} props
 */
export async function openAddSubject({ termId, section, onAdded, onNoneLeft }) {
  /** @type {import("@/api/teacher-loading.js").SectionLoading} */
  let data;
  try {
    data = await getSectionLoading(termId, section.id);
  } catch (error) {
    toast.error(error);
    return;
  }
  if (data.addable.length === 0) {
    onNoneLeft(`There is no subject left to add to ${section.label}. Add the subject's name on the Subjects page (step 2) first.`);
    return;
  }

  /** @type {number | null} */
  let addedSubjectId = null;
  openFormDialog({
    title: `Add a subject to ${section.label}`,
    description: `It is saved in Teacher Loading too, for ${termState.term?.name ?? "this term"}.`,
    fields: [
      { name: "subject_id", label: "Subject", type: "select", required: true, options: data.addable.map((item) => ({ value: item.id, label: item.name, hint: item.code ?? undefined })), help: "Not listed? Add its name on the Subjects page first." },
      {
        name: "teacher_id",
        label: "Teacher",
        type: "select",
        required: true,
        options: data.teachers.map((teacher) => {
          const isFull = teacher.assigned >= teacher.limit;
          return { value: teacher.id, label: teacher.name, hint: teacherHint(teacher, isFull), disabled: isFull };
        }),
        help: "A teacher with a full load (5 subjects) cannot be chosen.",
      },
    ],
    submitLabel: "Add subject",
    onSubmit: async (values) => {
      const subjectName = data.addable.find(({ id }) => id === Number(values.subject_id))?.name;
      const teacherName = data.teachers.find(({ id }) => id === Number(values.teacher_id))?.name;
      await assignTeacher(termId, section.id, Number(values.subject_id), Number(values.teacher_id));
      addedSubjectId = Number(values.subject_id);
      return `${subjectName} was added to ${section.label}, taught by ${teacherName}.`;
    },
    onClose: () => {
      if (addedSubjectId !== null) onAdded(addedSubjectId);
    },
  });
}
