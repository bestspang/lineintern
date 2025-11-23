import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CalendarIcon, X } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

interface AttendanceLogFiltersProps {
  dateFrom: Date | undefined;
  dateTo: Date | undefined;
  employeeId: string;
  branchId: string;
  eventType: string;
  status: string;
  employees: Array<{ id: string; full_name: string }>;
  branches: Array<{ id: string; name: string }>;
  onDateFromChange: (date: Date | undefined) => void;
  onDateToChange: (date: Date | undefined) => void;
  onEmployeeChange: (value: string) => void;
  onBranchChange: (value: string) => void;
  onEventTypeChange: (value: string) => void;
  onStatusChange: (value: string) => void;
  onReset: () => void;
}

export default function AttendanceLogFilters({
  dateFrom,
  dateTo,
  employeeId,
  branchId,
  eventType,
  status,
  employees,
  branches,
  onDateFromChange,
  onDateToChange,
  onEmployeeChange,
  onBranchChange,
  onEventTypeChange,
  onStatusChange,
  onReset,
}: AttendanceLogFiltersProps) {
  return (
    <Card>
      <CardContent className="p-4 sm:p-6 sm:pt-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
          {/* Date From */}
          <div className="space-y-2">
            <Label className="text-xs sm:text-sm">From Date</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    'w-full justify-start text-left font-normal text-sm',
                    !dateFrom && 'text-muted-foreground'
                  )}
                >
                  <CalendarIcon className="mr-2 h-3 w-3 sm:h-4 sm:w-4" />
                  {dateFrom ? format(dateFrom, 'PP') : 'Pick a date'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0">
                <Calendar
                  mode="single"
                  selected={dateFrom}
                  onSelect={onDateFromChange}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>

          {/* Date To */}
          <div className="space-y-2">
            <Label className="text-xs sm:text-sm">To Date</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    'w-full justify-start text-left font-normal text-sm',
                    !dateTo && 'text-muted-foreground'
                  )}
                >
                  <CalendarIcon className="mr-2 h-3 w-3 sm:h-4 sm:w-4" />
                  {dateTo ? format(dateTo, 'PP') : 'Pick a date'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0">
                <Calendar
                  mode="single"
                  selected={dateTo}
                  onSelect={onDateToChange}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>

          {/* Employee Filter */}
          <div className="space-y-2">
            <Label className="text-xs sm:text-sm">Employee</Label>
            <Select value={employeeId} onValueChange={onEmployeeChange}>
              <SelectTrigger className="text-sm">
                <SelectValue placeholder="All employees" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All employees</SelectItem>
                {employees.map((emp) => (
                  <SelectItem key={emp.id} value={emp.id}>
                    {emp.full_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Branch Filter */}
          <div className="space-y-2">
            <Label className="text-xs sm:text-sm">Branch</Label>
            <Select value={branchId} onValueChange={onBranchChange}>
              <SelectTrigger className="text-sm">
                <SelectValue placeholder="All branches" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All branches</SelectItem>
                {branches.map((branch) => (
                  <SelectItem key={branch.id} value={branch.id}>
                    {branch.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Event Type Filter */}
          <div className="space-y-2">
            <Label className="text-xs sm:text-sm">Event Type</Label>
            <Select value={eventType} onValueChange={onEventTypeChange}>
              <SelectTrigger className="text-sm">
                <SelectValue placeholder="All events" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All events</SelectItem>
                <SelectItem value="check_in">Check In</SelectItem>
                <SelectItem value="check_out">Check Out</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Status Filter */}
          <div className="space-y-2">
            <Label className="text-xs sm:text-sm">Status</Label>
            <Select value={status} onValueChange={onStatusChange}>
              <SelectTrigger className="text-sm">
                <SelectValue placeholder="All status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All status</SelectItem>
                <SelectItem value="flagged">Flagged</SelectItem>
                <SelectItem value="normal">Normal</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Reset Button */}
          <div className="space-y-2 flex items-end">
            <Button variant="outline" onClick={onReset} className="w-full text-sm">
              <X className="mr-2 h-3 w-3 sm:h-4 sm:w-4" />
              Reset
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
