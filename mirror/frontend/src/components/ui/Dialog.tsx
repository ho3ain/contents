import { Modal } from '../Modal';

/** Dialog wraps the existing accessible Modal so the kit exposes a
 *  declarative overlay primitive consistent with the design system. */
export function Dialog(props: React.ComponentProps<typeof Modal>) {
  return <Modal {...props} />;
}
