import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { toast } from "./use-toast";

export interface BrokerProfile {
  id: string;
  user_id: string;
  broker_code: string;
  broker_name: string;
  color: string;
  is_active: boolean;
  created_at: string;
}

export function useBrokerProfiles() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: brokers = [], isLoading } = useQuery({
    queryKey: ["broker_profiles", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("broker_profiles")
        .select("*")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data as unknown as BrokerProfile[];
    },
    enabled: !!user,
  });

  const activeBrokers = brokers.filter(b => b.is_active);

  const addBroker = async (broker_code: string, broker_name: string, color: string) => {
    if (!user) return;
    const code = broker_code.toUpperCase().slice(0, 4);
    const { error } = await supabase.from("broker_profiles").insert({
      user_id: user.id,
      broker_code: code,
      broker_name,
      color,
    } as any);
    if (error) {
      if (error.code === "23505") {
        toast({ title: "Broker sudah ada", description: `Kode ${code} sudah terdaftar`, variant: "destructive" });
      } else {
        throw error;
      }
      return;
    }
    queryClient.invalidateQueries({ queryKey: ["broker_profiles"] });
    toast({ title: "Broker ditambahkan", description: `${code} — ${broker_name}` });
  };

  const updateBroker = async (id: string, updates: Partial<Pick<BrokerProfile, "broker_name" | "color" | "is_active">>) => {
    if (!user) return;
    const { error } = await supabase.from("broker_profiles").update(updates as any).eq("id", id);
    if (error) throw error;
    queryClient.invalidateQueries({ queryKey: ["broker_profiles"] });
    toast({ title: "Broker diperbarui" });
  };

  const ensureDefaultBroker = async () => {
    if (!user || brokers.length > 0) return;
    await addBroker("AK", "Broker AK", "#00D4FF");
  };

  return {
    brokers,
    activeBrokers,
    isLoading,
    addBroker,
    updateBroker,
    ensureDefaultBroker,
  };
}
