import * as React from 'react'
import { cn } from '@/lib/utils'

type CardProps = React.ComponentProps<'div'> & {
  withBorder?: boolean;
  radius?: 'sm' | 'md' | 'lg' | 'xl';
  p?: number | 'xs' | 'sm' | 'md' | 'lg' | 'xl' | { base?: number | 'xs' | 'sm' | 'md' | 'lg' | 'xl'; sm?: number | 'xs' | 'sm' | 'md' | 'lg' | 'xl' };
};

function paddingClass(p: CardProps['p']) {
  const classes = { xs: 'p-2', sm: 'p-3', md: 'p-4', lg: 'p-6', xl: 'p-8' } as const;
  const responsiveClasses = { xs: 'sm:p-2', sm: 'sm:p-3', md: 'sm:p-4', lg: 'sm:p-6', xl: 'sm:p-8' } as const;
  if (typeof p === 'object') return cn(
    p.base !== undefined && typeof p.base === 'string' && classes[p.base],
    p.sm !== undefined && typeof p.sm === 'string' && responsiveClasses[p.sm],
    (typeof p.base === 'number' || typeof p.sm === 'number') && 'ui-card-responsive-padding',
  );
  return typeof p === 'string' ? classes[p] : p !== undefined ? 'ui-card-responsive-padding' : undefined;
}

function paddingStyle(p: CardProps['p']) {
  if (typeof p === 'number') return { padding: p };
  if (!p || typeof p !== 'object') return undefined;
  return {
    ...(typeof p.base === 'number' ? { '--card-padding-base': `${p.base}px` } : {}),
    ...(typeof p.sm === 'number' ? { '--card-padding-sm': `${p.sm}px` } : {}),
  } as React.CSSProperties;
}

function Card({ className, withBorder = true, radius = 'xl', p, style, ...props }: CardProps) {
  return (
    <div
      data-slot='card'
      className={cn(
        'flex flex-col rounded-xl bg-card text-card-foreground shadow-sm',
        withBorder && 'border',
        { sm: 'rounded-md', md: 'rounded-lg', lg: 'rounded-xl', xl: 'rounded-2xl' }[radius],
        paddingClass(p),
        className
      )}
      style={{ ...paddingStyle(p), ...style }}
      {...props}
    />
  )
}

function CardHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot='card-header'
      className={cn(
        '@container/card-header grid auto-rows-min grid-rows-[auto_auto] items-start gap-1.5 px-6 has-data-[slot=card-action]:grid-cols-[1fr_auto] [.border-b]:pb-6',
        className
      )}
      {...props}
    />
  )
}

function CardTitle({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot='card-title'
      className={cn('leading-none font-semibold', className)}
      {...props}
    />
  )
}

function CardDescription({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot='card-description'
      className={cn('text-sm text-muted-foreground', className)}
      {...props}
    />
  )
}

function CardAction({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot='card-action'
      className={cn(
        'col-start-2 row-span-2 row-start-1 self-start justify-self-end',
        className
      )}
      {...props}
    />
  )
}

function CardContent({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot='card-content'
      className={cn('px-6', className)}
      {...props}
    />
  )
}

function CardFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot='card-footer'
      className={cn('flex items-center px-6 [.border-t]:pt-6', className)}
      {...props}
    />
  )
}

export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardAction,
  CardDescription,
  CardContent,
}
