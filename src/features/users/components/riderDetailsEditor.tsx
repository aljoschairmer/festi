"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckIcon, Loader2Icon, PencilIcon, XIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Toggle } from "@/components/ui/toggle";
import type { Rider } from "@/features/community/actions/getRider";
import { LocationSearch } from "@/features/rides/components/locationSearch";
import { updateProfile } from "../actions/updateProfile";
import {
  formatBike,
  RIDING_STYLES,
  ridingStyleLabel,
  SKILL_LEVELS,
  skillLevelLabel,
  splitBike,
} from "../data/bikeData";
import { BikeCombobox } from "./bikeCombobox";

const NONE = "__none__";

type Field =
  | "bio"
  | "location"
  | "bike"
  | "skillLevel"
  | "yearsRiding"
  | "ridingStyles";

type ProfileState = {
  bio: string;
  location: string;
  bike: string;
  skillLevel: string;
  yearsRiding: string;
  ridingStyles: string[];
};

function toState(rider: Rider): ProfileState {
  return {
    bio: rider.bio ?? "",
    location: rider.location ?? "",
    bike: formatBike(rider.bikeBrand, rider.bikeModel),
    skillLevel: rider.skillLevel ?? NONE,
    yearsRiding: rider.yearsRiding != null ? String(rider.yearsRiding) : "",
    ridingStyles: rider.ridingStyles ?? [],
  };
}

export function RiderDetailsEditor({
  userId,
  rider,
}: {
  userId: string;
  rider: Rider;
}) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const [current, setCurrent] = useState<ProfileState>(() => toState(rider));
  const [editing, setEditing] = useState<Field | null>(null);
  const [draft, setDraft] = useState<ProfileState>(current);

  const mutation = useMutation({
    mutationFn: async (next: ProfileState) => {
      const { brand, model } = splitBike(next.bike);
      const years = next.yearsRiding.trim() ? Number(next.yearsRiding) : null;
      const result = await updateProfile({
        bio: next.bio,
        location: next.location,
        bikeBrand: brand ?? "",
        bikeModel: model ?? "",
        skillLevel: next.skillLevel === NONE ? "" : next.skillLevel,
        ridingStyles: next.ridingStyles,
        yearsRiding: Number.isFinite(years) ? years : null,
      });
      if (!result.success) throw new Error(result.error);
      return next;
    },
    onSuccess: (next) => {
      setCurrent(next);
      setEditing(null);
      queryClient.invalidateQueries({ queryKey: ["rider-profile", userId] });
      router.refresh();
      toast.success("Profile updated.");
    },
    onError: (error) => toast.error(error.message),
  });

  const startEdit = (field: Field) => {
    setDraft(current);
    setEditing(field);
  };

  const cancel = () => setEditing(null);
  const save = () => mutation.mutate(draft);

  const saving = mutation.isPending;

  return (
    <div className="divide-y">
      <Row
        label="About"
        isEditing={editing === "bio"}
        display={current.bio || null}
        onEdit={() => startEdit("bio")}
        onCancel={cancel}
        onSave={save}
        saving={saving}
      >
        <Textarea
          value={draft.bio}
          maxLength={500}
          onChange={(e) => setDraft((d) => ({ ...d, bio: e.target.value }))}
          placeholder="A few words about your riding…"
        />
      </Row>

      <Row
        label="Location"
        isEditing={editing === "location"}
        display={current.location || null}
        onEdit={() => startEdit("location")}
        onCancel={cancel}
        onSave={save}
        saving={saving}
      >
        <LocationSearch
          initialQuery={draft.location}
          placeholder="Search for your city or region…"
          onSelect={(place) =>
            setDraft((d) => ({ ...d, location: place.name }))
          }
          onQueryChange={(value) =>
            setDraft((d) => ({ ...d, location: value }))
          }
        />
      </Row>

      <Row
        label="Bike"
        isEditing={editing === "bike"}
        display={current.bike || null}
        onEdit={() => startEdit("bike")}
        onCancel={cancel}
        onSave={save}
        saving={saving}
      >
        <BikeCombobox
          value={draft.bike}
          onChange={(value) => setDraft((d) => ({ ...d, bike: value }))}
        />
      </Row>

      <Row
        label="Skill level"
        isEditing={editing === "skillLevel"}
        display={skillLevelLabel(
          current.skillLevel === NONE ? null : current.skillLevel,
        )}
        onEdit={() => startEdit("skillLevel")}
        onCancel={cancel}
        onSave={save}
        saving={saving}
      >
        <Select
          value={draft.skillLevel}
          onValueChange={(value) =>
            setDraft((d) => ({ ...d, skillLevel: value }))
          }
        >
          <SelectTrigger>
            <SelectValue placeholder="Select level" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>— None —</SelectItem>
            {SKILL_LEVELS.map((level) => (
              <SelectItem key={level.value} value={level.value}>
                {level.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Row>

      <Row
        label="Years riding"
        isEditing={editing === "yearsRiding"}
        display={
          current.yearsRiding
            ? `${current.yearsRiding} ${current.yearsRiding === "1" ? "year" : "years"}`
            : null
        }
        onEdit={() => startEdit("yearsRiding")}
        onCancel={cancel}
        onSave={save}
        saving={saving}
      >
        <Input
          type="number"
          min={0}
          max={80}
          value={draft.yearsRiding}
          onChange={(e) =>
            setDraft((d) => ({ ...d, yearsRiding: e.target.value }))
          }
          placeholder="e.g. 5"
        />
      </Row>

      <Row
        label="Riding styles"
        isEditing={editing === "ridingStyles"}
        display={
          current.ridingStyles.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {current.ridingStyles.map((style) => (
                <Badge key={style} variant="secondary">
                  {ridingStyleLabel(style)}
                </Badge>
              ))}
            </div>
          ) : null
        }
        onEdit={() => startEdit("ridingStyles")}
        onCancel={cancel}
        onSave={save}
        saving={saving}
      >
        <div className="flex flex-wrap gap-2">
          {RIDING_STYLES.map((style) => (
            <Toggle
              key={style.value}
              size="sm"
              variant="outline"
              pressed={draft.ridingStyles.includes(style.value)}
              onPressedChange={() =>
                setDraft((d) => ({
                  ...d,
                  ridingStyles: d.ridingStyles.includes(style.value)
                    ? d.ridingStyles.filter((s) => s !== style.value)
                    : [...d.ridingStyles, style.value],
                }))
              }
            >
              {style.label}
            </Toggle>
          ))}
        </div>
      </Row>
    </div>
  );
}

function Row({
  label,
  display,
  isEditing,
  onEdit,
  onCancel,
  onSave,
  saving,
  children,
}: {
  label: string;
  display: React.ReactNode | null;
  isEditing: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onSave: () => void;
  saving: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2 py-3 sm:flex-row sm:items-start sm:gap-4">
      <span className="w-32 shrink-0 pt-1.5 text-sm font-medium text-muted-foreground">
        {label}
      </span>

      <div className="min-w-0 flex-1">
        {isEditing ? (
          <div className="space-y-2">
            {children}
            <div className="flex items-center gap-2">
              <Button size="sm" onClick={onSave} disabled={saving}>
                {saving ? (
                  <Loader2Icon className="size-4 animate-spin" />
                ) : (
                  <CheckIcon className="size-4" />
                )}
                Save
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={onCancel}
                disabled={saving}
              >
                <XIcon className="size-4" />
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <div className="text-sm">
            {display ?? <span className="text-muted-foreground">Not set</span>}
          </div>
        )}
      </div>

      {!isEditing && (
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onEdit}
          aria-label={`Edit ${label}`}
          className="relative after:absolute after:-inset-2 after:content-['']"
        >
          <PencilIcon className="size-4" />
        </Button>
      )}
    </div>
  );
}
