import { Logo } from '@/components/shared/Logo';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-screen items-center justify-center bg-paper px-4">
      {/* Document texture */}
      <div className="bg-paper-grid mask-fade pointer-events-none absolute inset-0 opacity-[0.35]" />
      <div className="relative w-full max-w-sm">
        <div className="mb-8 flex justify-center">
          <Logo size={38} />
        </div>
        <div className="perf-ticket rounded-lg p-7 pl-9">{children}</div>
      </div>
    </div>
  );
}
