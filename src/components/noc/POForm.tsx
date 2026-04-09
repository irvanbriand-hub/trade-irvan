import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { X } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { AREA_NAMES, ALL_PROVINSI } from '@/lib/noc/constants';
import type { PO, POInsert } from '@/lib/noc/types';

const schema = z.object({
  name: z.string().min(1, 'Nama wajib diisi'),
  area: z.coerce.number().refine((v) => [1, 2, 3].includes(v), 'Pilih area yang valid') as z.ZodType<1 | 2 | 3>,
  provinsi_coverage: z.array(z.string()),
  kabupaten_coverage: z.array(z.string()),
  status: z.enum(['active', 'inactive']),
  notes: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

interface POFormProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (values: POInsert) => void;
  defaultValues?: PO;
  isLoading?: boolean;
}

export function POForm({ open, onClose, onSubmit, defaultValues, isLoading }: POFormProps) {
  const [kabInput, setKabInput] = useState('');

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: '',
      area: 1,
      provinsi_coverage: [],
      kabupaten_coverage: [],
      status: 'active',
      notes: '',
    },
  });

  useEffect(() => {
    if (defaultValues) {
      form.reset({
        name: defaultValues.name,
        area: defaultValues.area,
        provinsi_coverage: defaultValues.provinsi_coverage,
        kabupaten_coverage: defaultValues.kabupaten_coverage ?? [],
        status: defaultValues.status,
        notes: defaultValues.notes ?? '',
      });
    } else {
      form.reset({
        name: '',
        area: 1,
        provinsi_coverage: [],
        kabupaten_coverage: [],
        status: 'active',
        notes: '',
      });
    }
    setKabInput('');
  }, [defaultValues, open, form]);

  const watchedArea = form.watch('area');
  const watchedProvinsi = form.watch('provinsi_coverage');
  const watchedKab = form.watch('kabupaten_coverage');

  function toggleProvince(prov: string) {
    const current = form.getValues('provinsi_coverage');
    if (current.includes(prov)) {
      form.setValue('provinsi_coverage', current.filter((p) => p !== prov));
    } else {
      form.setValue('provinsi_coverage', [...current, prov]);
    }
  }

  function addKabupaten() {
    const val = kabInput.trim().toUpperCase();
    if (!val) return;
    const current = form.getValues('kabupaten_coverage');
    if (!current.includes(val)) {
      form.setValue('kabupaten_coverage', [...current, val]);
    }
    setKabInput('');
  }

  function removeKabupaten(kab: string) {
    const current = form.getValues('kabupaten_coverage');
    form.setValue('kabupaten_coverage', current.filter((k) => k !== kab));
  }

  function handleSubmit(values: FormValues) {
    onSubmit({
      name: values.name,
      area: values.area,
      provinsi_coverage: values.provinsi_coverage,
      kabupaten_coverage: values.kabupaten_coverage,
      status: values.status,
      notes: values.notes || null,
    });
  }

  const provinsiForArea = ALL_PROVINSI[watchedArea] ?? [];

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{defaultValues ? 'Edit PO' : 'Tambah PO'}</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            {/* Nama */}
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nama PO</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="Contoh: Budi Santoso" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Area + Status */}
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="area"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Area</FormLabel>
                    <Select
                      value={String(field.value)}
                      onValueChange={(v) => {
                        field.onChange(Number(v));
                        form.setValue('provinsi_coverage', []);
                      }}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {([1, 2, 3] as const).map((a) => (
                          <SelectItem key={a} value={String(a)}>
                            Area {a} — {AREA_NAMES[a]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Status</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="inactive">Inactive</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Provinsi Coverage */}
            <FormField
              control={form.control}
              name="provinsi_coverage"
              render={() => (
                <FormItem>
                  <FormLabel>
                    Provinsi Coverage
                    <span className="ml-2 text-xs text-muted-foreground">
                      ({watchedProvinsi.length} dipilih)
                    </span>
                  </FormLabel>
                  <div className="rounded-md border border-input p-3 max-h-48 overflow-y-auto grid grid-cols-2 gap-y-2 gap-x-4">
                    {provinsiForArea.map((prov) => (
                      <label key={prov} className="flex items-center gap-2 cursor-pointer">
                        <Checkbox
                          checked={watchedProvinsi.includes(prov)}
                          onCheckedChange={() => toggleProvince(prov)}
                        />
                        <span className="text-xs leading-tight">{prov}</span>
                      </label>
                    ))}
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Kabupaten Coverage */}
            <FormField
              control={form.control}
              name="kabupaten_coverage"
              render={() => (
                <FormItem>
                  <FormLabel>
                    Kabupaten Khusus
                    <span className="ml-2 text-xs text-muted-foreground">
                      (opsional — untuk pembagian by kabupaten seperti NTT)
                    </span>
                  </FormLabel>
                  {/* Tag chips */}
                  {watchedKab.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {watchedKab.map((kab) => (
                        <Badge
                          key={kab}
                          variant="secondary"
                          className="text-xs px-2 py-0.5 gap-1"
                        >
                          {kab}
                          <button
                            type="button"
                            onClick={() => removeKabupaten(kab)}
                            className="ml-0.5 rounded-full hover:text-destructive"
                          >
                            <X className="h-2.5 w-2.5" />
                          </button>
                        </Badge>
                      ))}
                    </div>
                  )}
                  {/* Add input */}
                  <div className="flex gap-2">
                    <Input
                      value={kabInput}
                      onChange={(e) => setKabInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          addKabupaten();
                        }
                      }}
                      placeholder="Ketik nama kabupaten, tekan Enter"
                      className="h-8 text-sm"
                    />
                    <Button type="button" size="sm" variant="outline" onClick={addKabupaten}>
                      Tambah
                    </Button>
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Notes */}
            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes (opsional)</FormLabel>
                  <FormControl>
                    <Textarea {...field} rows={2} placeholder="Catatan tambahan..." />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>
                Batal
              </Button>
              <Button type="submit" disabled={isLoading}>
                {isLoading ? 'Menyimpan...' : defaultValues ? 'Simpan Perubahan' : 'Tambah PO'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
