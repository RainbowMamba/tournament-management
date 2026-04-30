"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { verifyStaffCode } from "@/lib/actions/tournament";
import { addVerifiedTournament } from "@/lib/staff-session";
import { toast } from "sonner";
import { Key, Loader2 } from "lucide-react";

type Props = {
  tournamentId: string;
  tournamentName: string;
  open: boolean;
  onVerified: () => void;
  onClose?: () => void;
};

export function StaffVerificationDialog({ tournamentId, tournamentName, open, onVerified, onClose }: Props) {
  const router = useRouter();
  const t = useTranslations('staff.verification');

  const [code, setCode] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!code.trim()) {
      setError(t('codeRequired'));
      return;
    }

    setIsVerifying(true);

    try {
      const result = await verifyStaffCode(tournamentId, code);

      if (result.error) {
        setError(result.error);
        setIsVerifying(false);
        return;
      }

      // Add to verified tournaments in session
      await addVerifiedTournament(tournamentId);

      toast.success(t('success'));
      setCode("");
      onVerified();
      router.refresh();
    } catch (err) {
      setError(t('error'));
      setIsVerifying(false);
    }
  }

  function handleOpenChange(isOpen: boolean) {
    if (!isOpen && !isVerifying) {
      setCode("");
      setError(null);
      onClose?.();
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Key className="h-5 w-5" />
            {t('title')}
          </DialogTitle>
          <DialogDescription>
            {t('description', { name: tournamentName })}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="py-4 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="code">{t('codeLabel')}</Label>
              <Input
                id="code"
                type="text"
                placeholder={t('codePlaceholder')}
                value={code}
                onChange={(e) => {
                  setCode(e.target.value.toUpperCase());
                  setError(null);
                }}
                disabled={isVerifying}
                className="text-center text-lg font-mono tracking-widest uppercase"
                autoFocus
                maxLength={8}
              />
              {error && (
                <p className="text-sm text-destructive">{error}</p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button
              type="submit"
              disabled={isVerifying || !code.trim()}
              className="w-full"
            >
              {isVerifying ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t('verifying')}
                </>
              ) : (
                t('verify')
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
