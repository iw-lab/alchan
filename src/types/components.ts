// src/types/components.ts
// 컴포넌트 Props 타입 정의

import { ReactNode, CSSProperties, MouseEvent, ChangeEvent, FormEvent } from 'react';
import { LucideIcon } from 'lucide-react';

// ============================================
// Common Component Props
// ============================================

export interface BaseComponentProps {
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
  id?: string;
  'data-testid'?: string;
}

// ============================================
// Button Components
// ============================================

export interface ButtonProps extends BaseComponentProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  loading?: boolean;
  icon?: LucideIcon;
  iconPosition?: 'left' | 'right';
  onClick?: (event: MouseEvent<HTMLButtonElement>) => void;
  type?: 'button' | 'submit' | 'reset';
  fullWidth?: boolean;
}

export type ButtonVariant =
  | 'primary'
  | 'secondary'
  | 'outline'
  | 'ghost'
  | 'danger'
  | 'success'
  | 'warning';

export type ButtonSize = 'sm' | 'md' | 'lg' | 'xl';

// ============================================
// Input Components
// ============================================

export interface InputProps extends BaseComponentProps {
  type?: InputType;
  value?: string | number;
  defaultValue?: string | number;
  placeholder?: string;
  disabled?: boolean;
  readOnly?: boolean;
  required?: boolean;
  label?: string;
  error?: string;
  hint?: string;
  icon?: LucideIcon;
  iconPosition?: 'left' | 'right';
  onChange?: (event: ChangeEvent<HTMLInputElement>) => void;
  onBlur?: (event: ChangeEvent<HTMLInputElement>) => void;
  onFocus?: (event: ChangeEvent<HTMLInputElement>) => void;
  name?: string;
  autoComplete?: string;
  min?: number;
  max?: number;
  step?: number;
  pattern?: string;
  maxLength?: number;
}

export type InputType =
  | 'text'
  | 'email'
  | 'password'
  | 'number'
  | 'tel'
  | 'url'
  | 'search'
  | 'date'
  | 'time'
  | 'datetime-local';

export interface TextAreaProps extends Omit<InputProps, 'type' | 'icon' | 'onChange' | 'onBlur' | 'onFocus'> {
  rows?: number;
  cols?: number;
  resize?: 'none' | 'both' | 'horizontal' | 'vertical';
  onChange?: (event: ChangeEvent<HTMLTextAreaElement>) => void;
  onBlur?: (event: ChangeEvent<HTMLTextAreaElement>) => void;
  onFocus?: (event: ChangeEvent<HTMLTextAreaElement>) => void;
}

export interface SelectProps extends BaseComponentProps {
  value?: string | number;
  defaultValue?: string | number;
  options: SelectOption[];
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  label?: string;
  error?: string;
  hint?: string;
  onChange?: (event: ChangeEvent<HTMLSelectElement>) => void;
  name?: string;
}

export interface SelectOption {
  value: string | number;
  label: string;
  disabled?: boolean;
}

// ============================================
// Card Components
// ============================================

export interface CardProps extends BaseComponentProps {
  variant?: CardVariant;
  padding?: CardPadding;
  hover?: boolean;
  onClick?: () => void;
}

export type CardVariant = 'default' | 'outlined' | 'elevated';
export type CardPadding = 'none' | 'sm' | 'md' | 'lg' | 'xl';

export interface CardHeaderProps extends BaseComponentProps {
  title?: string;
  subtitle?: string;
  icon?: LucideIcon;
  action?: ReactNode;
}

export interface CardContentProps extends BaseComponentProps {
  padding?: CardPadding;
}

export interface CardFooterProps extends BaseComponentProps {
  justify?: 'start' | 'center' | 'end' | 'between';
}

// ============================================
// Modal Components
// ============================================

export interface ModalProps extends BaseComponentProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  size?: ModalSize;
  footer?: ReactNode;
  closeOnOverlayClick?: boolean;
  closeOnEscape?: boolean;
  showCloseButton?: boolean;
}

export type ModalSize = 'sm' | 'md' | 'lg' | 'xl' | 'full';

// ============================================
// Alert Components
// ============================================

export interface AlertProps extends BaseComponentProps {
  variant?: AlertVariant;
  title?: string;
  icon?: LucideIcon;
  closable?: boolean;
  onClose?: () => void;
}

export type AlertVariant =
  | 'info'
  | 'success'
  | 'warning'
  | 'error';

// ============================================
// Badge Components
// ============================================

export interface BadgeProps extends BaseComponentProps {
  variant?: BadgeVariant;
  size?: BadgeSize;
  dot?: boolean;
}

export type BadgeVariant =
  | 'default'
  | 'primary'
  | 'success'
  | 'warning'
  | 'error'
  | 'info';

export type BadgeSize = 'sm' | 'md' | 'lg';

// ============================================
// Table Components
// ============================================

export interface TableProps extends BaseComponentProps {
  striped?: boolean;
  hoverable?: boolean;
  bordered?: boolean;
  compact?: boolean;
}

export interface TableHeaderProps extends BaseComponentProps {}
export interface TableBodyProps extends BaseComponentProps {}
export interface TableRowProps extends BaseComponentProps {
  onClick?: () => void;
  selected?: boolean;
}
export interface TableHeadProps extends BaseComponentProps {
  sortable?: boolean;
  sortDirection?: 'asc' | 'desc' | null;
  onSort?: () => void;
}
export interface TableCellProps extends BaseComponentProps {
  align?: 'left' | 'center' | 'right';
}

// ============================================
// Pagination Components
// ============================================

export interface PaginationProps extends BaseComponentProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  showFirstLast?: boolean;
  maxVisible?: number;
}

// ============================================
// Loading Components
// ============================================

export interface SpinnerProps extends BaseComponentProps {
  size?: SpinnerSize;
  color?: string;
}

export type SpinnerSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

export interface SkeletonProps extends BaseComponentProps {
  width?: string | number;
  height?: string | number;
  variant?: 'text' | 'circular' | 'rectangular';
  animation?: 'pulse' | 'wave' | 'none';
}

// ============================================
// Navigation Components
// ============================================

export interface NavItemProps {
  to: string;
  icon?: LucideIcon;
  label: string;
  badge?: string | number;
  active?: boolean;
  onClick?: () => void;
}

export interface TabsProps extends BaseComponentProps {
  defaultValue?: string;
  value?: string;
  onChange?: (value: string) => void;
}

export interface TabProps extends BaseComponentProps {
  value: string;
  label: string;
  icon?: LucideIcon;
  disabled?: boolean;
}

// ============================================
// Form Components
// ============================================

export interface FormProps extends BaseComponentProps {
  onSubmit?: (event: FormEvent<HTMLFormElement>) => void;
  noValidate?: boolean;
}

export interface FormFieldProps extends BaseComponentProps {
  label?: string;
  error?: string;
  hint?: string;
  required?: boolean;
  htmlFor?: string;
}

// ============================================
// Dropdown Components
// ============================================

export interface DropdownProps extends BaseComponentProps {
  trigger: ReactNode;
  items: DropdownItem[];
  placement?: DropdownPlacement;
  onSelect?: (value: string) => void;
}

export interface DropdownItem {
  value: string;
  label: string;
  icon?: LucideIcon;
  disabled?: boolean;
  divider?: boolean;
  danger?: boolean;
}

export type DropdownPlacement =
  | 'bottom-start'
  | 'bottom-end'
  | 'top-start'
  | 'top-end';

// ============================================
// Toast/Notification Components
// ============================================

export interface ToastProps {
  id: string;
  title?: string;
  message: string;
  variant?: ToastVariant;
  duration?: number;
  icon?: LucideIcon;
  closable?: boolean;
  onClose?: () => void;
}

export type ToastVariant = 'info' | 'success' | 'warning' | 'error';

// ============================================
// Empty State Components
// ============================================

export interface EmptyStateProps extends BaseComponentProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
}

// ============================================
// Page Components
// ============================================

export interface PageHeaderProps extends BaseComponentProps {
  title: string;
  subtitle?: string;
  icon?: LucideIcon;
  breadcrumbs?: BreadcrumbItem[];
  action?: ReactNode;
}

export interface BreadcrumbItem {
  label: string;
  href?: string;
  icon?: LucideIcon;
}

// ============================================
// List Components
// ============================================

export interface ListProps extends BaseComponentProps {
  items: any[];
  renderItem: (item: any, index: number) => ReactNode;
  loading?: boolean;
  empty?: ReactNode;
  divider?: boolean;
}

export interface ListItemProps extends BaseComponentProps {
  icon?: LucideIcon;
  primary?: ReactNode;
  secondary?: ReactNode;
  action?: ReactNode;
  onClick?: () => void;
  selected?: boolean;
}

// ============================================
// Avatar Components
// ============================================

export interface AvatarProps extends BaseComponentProps {
  src?: string;
  alt?: string;
  name?: string;
  size?: AvatarSize;
  shape?: 'circle' | 'square';
  fallbackIcon?: LucideIcon;
}

export type AvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

// ============================================
// Progress Components
// ============================================

export interface ProgressProps extends BaseComponentProps {
  value: number;
  max?: number;
  variant?: ProgressVariant;
  size?: ProgressSize;
  showLabel?: boolean;
  label?: string;
}

export type ProgressVariant = 'default' | 'success' | 'warning' | 'error';
export type ProgressSize = 'sm' | 'md' | 'lg';

// ============================================
// Tooltip Components
// ============================================

export interface TooltipProps extends BaseComponentProps {
  content: ReactNode;
  placement?: TooltipPlacement;
  delay?: number;
}

export type TooltipPlacement =
  | 'top'
  | 'bottom'
  | 'left'
  | 'right'
  | 'top-start'
  | 'top-end'
  | 'bottom-start'
  | 'bottom-end';

// ============================================
// Switch/Toggle Components
// ============================================

export interface SwitchProps extends BaseComponentProps {
  checked?: boolean;
  defaultChecked?: boolean;
  disabled?: boolean;
  label?: string;
  onChange?: (checked: boolean) => void;
  name?: string;
}

// ============================================
// Radio/Checkbox Components
// ============================================

export interface CheckboxProps extends BaseComponentProps {
  checked?: boolean;
  defaultChecked?: boolean;
  disabled?: boolean;
  label?: string;
  onChange?: (event: ChangeEvent<HTMLInputElement>) => void;
  name?: string;
  value?: string;
  indeterminate?: boolean;
}

export interface RadioProps extends BaseComponentProps {
  checked?: boolean;
  defaultChecked?: boolean;
  disabled?: boolean;
  label?: string;
  onChange?: (event: ChangeEvent<HTMLInputElement>) => void;
  name?: string;
  value: string;
}

export interface RadioGroupProps extends BaseComponentProps {
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  name?: string;
  options: RadioOption[];
  direction?: 'horizontal' | 'vertical';
}

export interface RadioOption {
  value: string;
  label: string;
  disabled?: boolean;
}
