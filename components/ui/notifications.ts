import { toast } from "sonner";

interface NotificationOptions {
  title?: string;
  message?: string;
  color?: string;
  description?: string;
}

export const notifications = {
  show({ title, message, color, description }: NotificationOptions) {
    const content = message ?? description ?? title ?? "";
    if (color === "red" || color === "danger") return toast.error(title && message ? title : content, title && message ? { description: message } : undefined);
    if (color === "green" || color === "success") return toast.success(title && message ? title : content, title && message ? { description: message } : undefined);
    return toast(title ?? content, title && message ? { description: message } : undefined);
  },
};
