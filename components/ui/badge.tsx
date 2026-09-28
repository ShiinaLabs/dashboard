import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center justify-center rounded-md border px-2 py-0.5 text-xs font-medium w-fit whitespace-nowrap shrink-0 [&>svg]:size-3 gap-1 [&>svg]:pointer-events-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive transition-[color,box-shadow] overflow-hidden',
  {
    variants: {
      variant: {
        default:
          'border-transparent bg-primary text-primary-foreground [a&]:hover:bg-primary/90',
        secondary:
          'border-transparent bg-secondary text-secondary-foreground [a&]:hover:bg-secondary/90',
        destructive:
          'border-transparent bg-destructive text-white [a&]:hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive/60',
        outline:
          'text-foreground [a&]:hover:bg-accent [a&]:hover:text-accent-foreground',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
)

type BadgeProps = Omit<React.ComponentProps<'span'> & VariantProps<typeof badgeVariants>, 'variant'> & {
  asChild?: boolean
  color?: 'gray' | 'success' | 'warning' | 'danger' | 'primary' | 'blue'
  size?: 'xs' | 'sm' | 'md'
  leftSection?: React.ReactNode
  rightSection?: React.ReactNode
  variant?: 'default' | 'secondary' | 'destructive' | 'outline' | 'light' | 'filled'
}

function Badge({
  className,
  variant = 'default',
  color = 'gray',
  size = 'sm',
  leftSection,
  rightSection,
  asChild = false,
  children,
  ...props
}: BadgeProps) {
  const Comp = asChild ? Slot : 'span'
  const tone = color === 'success' ? 'bg-green-500/10 text-green-700 dark:text-green-300'
    : color === 'warning' ? 'bg-amber-500/10 text-amber-700 dark:text-amber-300'
      : color === 'danger' ? 'bg-destructive/10 text-destructive'
        : color === 'primary' || color === 'blue' ? 'bg-primary/10 text-primary' : ''
  const sizing = size === 'xs' ? 'px-1.5 py-0 text-[10px]' : size === 'md' ? 'px-2.5 py-1 text-sm' : ''
  const variantClass = variant === 'light' ? 'border-transparent bg-muted text-foreground'
    : variant === 'filled' ? 'border-transparent' : ''

  return (
    <Comp
      data-slot='badge'
      className={cn(badgeVariants({ variant: variant === 'light' || variant === 'filled' ? 'secondary' : variant }), tone, sizing, variantClass, className)}
      {...props}
    >
      {leftSection}
      {children}
      {rightSection}
    </Comp>
  )
}

export { Badge, badgeVariants }
