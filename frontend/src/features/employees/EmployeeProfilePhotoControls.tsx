import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Camera, Trash2 } from "lucide-react";
import { useState } from "react";

import { useToast } from "@/components/feedback/useToast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { friendlyHrmError } from "@/lib/hrm-errors";

import { employeesApi } from "./employees.api";

const allowedImageTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

const fileToBase64 = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? "");
      resolve(result.includes(",") ? result.split(",").pop() ?? "" : result);
    };
    reader.onerror = () => reject(reader.error ?? new Error("File could not be read."));
    reader.readAsDataURL(file);
  });

export const EmployeeProfilePhotoControls = ({
  employeeId,
  hasPhoto,
}: {
  employeeId: string;
  hasPhoto: boolean;
}) => {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [reason, setReason] = useState("");
  const [file, setFile] = useState<File | null>(null);

  const invalidateProfile = async () => {
    await queryClient.invalidateQueries({ queryKey: ["employees", employeeId] });
  };

  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error("Choose a JPG, PNG, or WebP image first.");
      if (!allowedImageTypes.has(file.type)) throw new Error("Profile picture must be a JPG, PNG, or WebP image.");
      if (file.size > 2 * 1024 * 1024) throw new Error("Profile picture must be 2 MB or smaller.");
      if (reason.trim().length < 3) throw new Error("A reason is required.");
      return employeesApi.updateProfilePhoto(employeeId, {
        file_name: file.name,
        mime_type: file.type as "image/jpeg" | "image/png" | "image/webp",
        content_base64: await fileToBase64(file),
        reason: reason.trim(),
      });
    },
    onSuccess: async () => {
      setFile(null);
      setReason("");
      await invalidateProfile();
      toast.success("Employee profile picture updated.");
    },
    onError: (error) => toast.error(friendlyHrmError(error, "Profile picture could not be updated.")),
  });

  const removeMutation = useMutation({
    mutationFn: async () => {
      if (reason.trim().length < 3) throw new Error("A reason is required.");
      return employeesApi.removeProfilePhoto(employeeId, reason.trim());
    },
    onSuccess: async () => {
      setReason("");
      await invalidateProfile();
      toast.success("Employee profile picture removed.");
    },
    onError: (error) => toast.error(friendlyHrmError(error, "Profile picture could not be removed.")),
  });

  return (
    <div className="space-y-2 rounded-md border bg-slate-50 p-3">
      <p className="text-xs font-medium text-muted-foreground">Employee profile picture</p>
      <Input
        accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
        type="file"
        onChange={(event) => setFile(event.target.files?.[0] ?? null)}
      />
      <Input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Reason for photo change" />
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" onClick={() => uploadMutation.mutate()} disabled={!file || uploadMutation.isPending}>
          <Camera className="h-4 w-4" />
          Upload photo
        </Button>
        {hasPhoto ? (
          <Button type="button" size="sm" variant="outline" onClick={() => removeMutation.mutate()} disabled={removeMutation.isPending}>
            <Trash2 className="h-4 w-4" />
            Remove
          </Button>
        ) : null}
      </div>
    </div>
  );
};

