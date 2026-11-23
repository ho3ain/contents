/* eslint-disable react-refresh/only-export-components */
// MESH UI kit — single entry point for design-system primitives.
// Every primitive reads tokens/theme via `useTheme()` or the shared CSS
// custom properties (`var(--*)`), keeping the whole UI on one source.

export { Badge } from './Badge';
export type { BadgeProps, BadgeTone, BadgeDot } from './Badge';

export { Button, TextButton, PrimaryTextButton, IconButton } from './Button';
export type { ButtonProps, ButtonVariant, ButtonSize, IconButtonProps } from './Button';

export { Card, CardBody, CardFooter, SectionCard } from './Card';
export type { CardProps, CardVariant, SectionCardProps } from './Card';
export { ProductRow, ProductRowList, ProductRowMenu, ProductRowSkeleton, RowMeta } from './ProductRow';
export type { ProductRowProps, ProductRowMenuItem } from './ProductRow';
export { PriorityPanel } from './PriorityPanel';
export type { PriorityPanelProps, PriorityPanelTone } from './PriorityPanel';
export { InlineSection } from './InlineSection';
export type { InlineSectionProps } from './InlineSection';

export { Chip } from './Chip';
export type { ChipProps } from './Chip';

export { Input, Textarea, SearchField, Field } from './Input';
export type { InputProps, FieldProps } from './Input';

export { SegmentedControl } from './SegmentedControl';
export type { SegmentedControlProps, SegmentedOption } from './SegmentedControl';

export { Dialog } from './Dialog';
export { Divider } from './Divider';
export { Spinner, PageLoader } from './Spinner';
export { Spacer } from './Spacer';

export { AppText } from './AppText';
export type { AppTextProps, TextVariant } from './AppText';

export { AppIcon } from './AppIcon';
export { MeshIcon } from './icons/MeshIcon';
export { Price } from './Price';
export type { PriceProps, PriceSize } from './Price';
export { StateIcon } from './icons/StateIcon';
export { ICON_SIZES, iconPx } from './icons/types';
export { MESH_ICONS, meshIconNames, isMeshIconName } from './icons/mesh';
export { baseIconNames, DIRECTIONAL as DIRECTIONAL_ICONS } from './icons/base';

export { MeshMark } from './MeshMark';
export type { AppIconProps, IconName } from './AppIcon';
export type { MeshIconProps } from './icons/MeshIcon';
export type { UiState } from './icons/StateIcon';
export type { MeshIconName } from './icons/mesh';
export type { BaseIconName } from './icons/base';
export type { IconSize, IconSizeToken, IconTone, IconBaseProps } from './icons/types';

export { FloatingActionButton } from './FloatingActionButton';
export type { FloatingActionButtonProps } from './FloatingActionButton';

export { CodeInput } from './CodeInput';
export type { CodeInputProps } from './CodeInput';

export { Toggle } from './Toggle';
export type { ToggleProps } from './Toggle';

export { Alert } from './Alert';
export type { AlertKind } from './Alert';

export { BackLink } from './BackLink';
export { Stat } from './Stat';

export { ProgressBar } from './ProgressBar';
export type { ProgressBarProps, ProgressTone } from './ProgressBar';

export { Tabs, TabPanel } from './Tabs';
export type { TabsProps, TabItem } from './Tabs';

// Feedback surfaces (moved into components/feedback for parity with the
// reference architecture; re-exported here for backward compatibility).
export { EmptyState, ErrorState, LoadingState, ErrorBanner, NotFoundState, ForbiddenState } from '../feedback';
export { toastIcons } from '../feedback';
export type { ToastKind } from '../feedback';

// Layout header moved into components/layout.
export { PageHeader } from '../layout/Header';
export { Screen, Section } from '../layout/Screen';

export {
  SkeletonText,
  SkeletonAvatar,
  SkeletonCard,
  SkeletonCardGrid,
  SkeletonList,
  SkeletonTable,
  SkeletonStatGrid,
  SkeletonDetail,
} from './Skeleton';
export { ConfirmDialog } from './ConfirmDialog';
