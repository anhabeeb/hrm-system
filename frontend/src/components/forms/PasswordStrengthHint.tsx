import { CheckCircle2, Circle } from "lucide-react";

const checks = [
  { label: "At least 12 characters", test: (value: string) => value.length >= 12 },
  { label: "Uppercase letter", test: (value: string) => /[A-Z]/.test(value) },
  { label: "Lowercase letter", test: (value: string) => /[a-z]/.test(value) },
  { label: "Number", test: (value: string) => /\d/.test(value) },
  { label: "Symbol", test: (value: string) => /[^A-Za-z0-9]/.test(value) },
];

export const isStrongPassword = (value: string) => checks.every((check) => check.test(value));

export const PasswordStrengthHint = ({ password }: { password: string }) => (
  <div className="grid gap-1 rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground sm:grid-cols-2">
    {checks.map((check) => {
      const passed = check.test(password);
      return (
        <div key={check.label} className="flex items-center gap-1.5">
          {passed ? <CheckCircle2 className="h-3.5 w-3.5 text-green-600" /> : <Circle className="h-3.5 w-3.5" />}
          <span className={passed ? "text-green-700" : undefined}>{check.label}</span>
        </div>
      );
    })}
  </div>
);
