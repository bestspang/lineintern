// =============================
// FORMATTING UTILITIES
// =============================

import { formatBangkokTime } from '../../_shared/timezone.ts';

export function formatTimeDistance(date: Date, locale: 'en' | 'th' = 'en'): string {
  const now = new Date();
  const diffMs = date.getTime() - now.getTime();
  const diffSec = Math.floor(Math.abs(diffMs) / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);
  
  const isPast = diffMs < 0;
  
  const t = locale === 'th' ? {
    prefix: isPast ? '' : 'ใน ',
    suffix: isPast ? ' ที่แล้ว' : '',
    second: 'วินาที',
    minute: 'นาที',
    hour: 'ชั่วโมง',
    day: 'วัน',
    at: 'เวลา'
  } : {
    prefix: isPast ? '' : 'in ',
    suffix: isPast ? ' ago' : '',
    second: 'second',
    minute: 'minute',
    hour: 'hour',
    day: 'day',
    at: 'at'
  };
  
  if (!isPast) {
    if (diffMin < 1) {
      return locale === 'th' 
        ? `ใน ${diffSec} วินาที` 
        : `in ${diffSec} second${diffSec !== 1 ? 's' : ''}`;
    }
    
    if (diffMin < 60) {
      return locale === 'th'
        ? `ใน ${diffMin} นาที`
        : `in ${diffMin} minute${diffMin !== 1 ? 's' : ''}`;
    }
    
    if (diffHour < 24) {
      const remainingMin = diffMin % 60;
      if (remainingMin > 0) {
        return locale === 'th'
          ? `ใน ${diffHour} ชั่วโมง ${remainingMin} นาที`
          : `in ${diffHour} hour${diffHour !== 1 ? 's' : ''} ${remainingMin} minute${remainingMin !== 1 ? 's' : ''}`;
      }
      return locale === 'th'
        ? `ใน ${diffHour} ชั่วโมง`
        : `in ${diffHour} hour${diffHour !== 1 ? 's' : ''}`;
    }
    
    const formattedDate = formatBangkokTime(date, 'MMM d, HH:mm');
    
    if (diffDay < 2) {
      return locale === 'th'
        ? `พรุ่งนี้ ${formattedDate.split(' ').slice(-1)[0]}`
        : `tomorrow at ${formattedDate.split(', ')[1]}`;
    }
    
    return locale === 'th'
      ? `วันที่ ${formattedDate}`
      : `on ${formattedDate}`;
  }
  
  if (diffSec < 60) return `${diffSec} ${t.second}${locale === 'en' && diffSec !== 1 ? 's' : ''} ${t.suffix}`;
  if (diffMin < 60) return `${diffMin} ${t.minute}${locale === 'en' && diffMin !== 1 ? 's' : ''} ${t.suffix}`;
  if (diffHour < 24) return `${diffHour} ${t.hour}${locale === 'en' && diffHour !== 1 ? 's' : ''} ${t.suffix}`;
  return `${diffDay} ${t.day}${locale === 'en' && diffDay !== 1 ? 's' : ''} ${t.suffix}`;
}

export function getTaskUrgencyEmoji(task: any): string {
  const hoursLeft = (new Date(task.due_at).getTime() - Date.now()) / (1000 * 60 * 60);
  if (hoursLeft < 0) return '⚠️';
  if (hoursLeft <= 6) return '🔥';
  if (hoursLeft <= 24) return '⏰';
  return '📅';
}

export function getTaskStatusLabel(task: any, locale: 'th' | 'en'): string {
  const hoursLeft = (new Date(task.due_at).getTime() - Date.now()) / (1000 * 60 * 60);
  if (hoursLeft < 0) {
    return locale === 'th' ? '[เลยกำหนด]' : '[OVERDUE]';
  }
  if (hoursLeft <= 6) {
    return locale === 'th' ? '[ด่วนมาก]' : '[URGENT]';
  }
  if (hoursLeft <= 24) {
    return locale === 'th' ? '[เร่งด่วน]' : '[SOON]';
  }
  return '';
}

export function formatTimeUntilDue(dueAt: string, locale: 'th' | 'en'): string {
  const hours = (new Date(dueAt).getTime() - Date.now()) / (1000 * 60 * 60);
  
  if (hours < 0) {
    const daysOverdue = Math.ceil(Math.abs(hours) / 24);
    return locale === 'th' 
      ? `เลยมา ${daysOverdue} วัน`
      : `${daysOverdue}d overdue`;
  }
  
  if (hours <= 24) {
    return locale === 'th'
      ? `เหลือ ${Math.ceil(hours)} ชม.`
      : `${Math.ceil(hours)}h left`;
  }
  
  const days = Math.ceil(hours / 24);
  return locale === 'th'
    ? `เหลือ ${days} วัน`
    : `${days}d left`;
}

export function detectLanguage(text: string): 'th' | 'en' {
  return /[\u0E00-\u0E7F]/.test(text) ? 'th' : 'en';
}
