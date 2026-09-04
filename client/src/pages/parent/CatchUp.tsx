import { useAuth } from '../../context/AuthContext';
import StudentCatchUp from '../student/CatchUp';
import { EmptyState } from '../../components/ui';

/** Parents get the same Catch-Up Hub view, read-only, for the selected child. */
export default function ParentCatchUp() {
  const { activeChild } = useAuth();
  if (!activeChild) return <EmptyState icon="users" title="No child linked to your account" />;
  return <StudentCatchUp studentId={activeChild.id} />;
}
