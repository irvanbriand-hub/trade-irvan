import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables, TablesInsert } from "@/integrations/supabase/types";

export type ContentPage = Tables<"content_pages">;
export type ContentPageInsert = TablesInsert<"content_pages">;

export function useContentPages() {
  return useQuery({
    queryKey: ["content_pages"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("content_pages")
        .select("*")
        .order("brand", { ascending: true, nullsFirst: false })
        .order("platform", { ascending: true })
        .order("name", { ascending: true });
      if (error) throw error;
      return data;
    },
  });
}

export function useCreateContentPage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (page: Omit<ContentPageInsert, "user_id">) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      const { data, error } = await supabase
        .from("content_pages")
        .insert({ ...page, user_id: user.id })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["content_pages"] }),
  });
}

export function useUpdateContentPage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...patch }: { id: string } & Partial<Omit<ContentPage, "id" | "user_id" | "created_at">>) => {
      const { error } = await supabase.from("content_pages").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["content_pages"] }),
  });
}

export function useDeleteContentPage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      // ON DELETE CASCADE menghapus semua content_schedules milik page ini
      const { error } = await supabase.from("content_pages").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["content_pages"] });
      qc.invalidateQueries({ queryKey: ["content_schedules"] });
    },
  });
}
