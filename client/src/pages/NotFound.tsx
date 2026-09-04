import { Link } from 'react-router-dom';
import { EmptyState } from '../components/ui';

export default function NotFound({ home }: { home: string }) {
  return (
    <EmptyState
      icon="search"
      title="We couldn't find that page"
      body="The link may be out of date, or you may not have access to this section with your current role."
      action={<Link className="btn-primary" to={home}>Back to my dashboard</Link>}
    />
  );
}
