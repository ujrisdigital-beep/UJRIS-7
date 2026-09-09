import { AppHeader } from "@/components/app-header";
import { OnboardingWizard } from "@/components/onboarding/onboarding-wizard";

export default function OnboardingPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <AppHeader />
      <main className="flex-1 bg-secondary/20 px-4 py-14 sm:py-20">
        <OnboardingWizard />
      </main>
    </div>
  );
}
