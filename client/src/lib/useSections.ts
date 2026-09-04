import { useFetch } from './useFetch';

export type Section = {
  id: number; key: string; name: string; sort_order: number; is_active: number;
  class_count?: number; subject_count?: number; student_count?: number;
  /** The staff who work in this part of the school, as the roll knows them. */
  teachers?: { id: number; name: string; email: string }[];
};

/**
 * The phases this school divides itself into, in its own order and its own
 * words. Every screen that groups pupils, classes or subjects reads them from
 * here rather than assuming nursery, primary and secondary.
 */
export function useSections() {
  const { data, loading, error, reload } = useFetch<Section[]>('/sections');
  const sections = data ?? [];
  const nameOf = (key: string) => sections.find((s) => s.key === key)?.name ?? key;
  return { sections, nameOf, loading, error, reload };
}
