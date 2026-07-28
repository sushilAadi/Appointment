import { getSupabaseAdmin } from "../supabaseAdmin";

/**
 * A doctor-defined "I'm unavailable during this window" block — e.g. the
 * afternoon off, or a custom time range. The availability engine treats
 * these as busy time exactly like a CONFIRMED appointment or a Google
 * Calendar event, so blocked time simply stops showing up as bookable.
 */
export interface DoctorBlock {
  id: string;
  startTime: Date;
  endTime: Date;
  reason: string | null;
  createdAt: Date;
}

interface DoctorBlockRow {
  id: string;
  start_time: string;
  end_time: string;
  reason: string | null;
  created_at: string;
}

function mapRow(row: DoctorBlockRow): DoctorBlock {
  return {
    id: row.id,
    startTime: new Date(row.start_time),
    endTime: new Date(row.end_time),
    reason: row.reason,
    createdAt: new Date(row.created_at),
  };
}

export async function createDoctorBlock(input: {
  start: Date;
  end: Date;
  reason?: string | null;
}): Promise<DoctorBlock> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("doctor_blocks")
    .insert({
      start_time: input.start.toISOString(),
      end_time: input.end.toISOString(),
      reason: input.reason ?? null,
    })
    .select()
    .single();

  if (error || !data) throw new Error(`Failed to create doctor block: ${error?.message}`);
  return mapRow(data as DoctorBlockRow);
}

export interface DoctorBlockQuery {
  startFrom?: Date; // window start — blocks ending at/before this are excluded
  startBefore?: Date; // window end — blocks starting at/after this are excluded
}

/**
 * Returns blocks that overlap the given window (not just ones that *start*
 * within it) — a block created for 4pm-9pm shouldn't be missed by a query
 * for a window ending at 5pm.
 */
export async function listDoctorBlocks(query: DoctorBlockQuery = {}): Promise<DoctorBlock[]> {
  const supabase = getSupabaseAdmin();
  let builder = supabase.from("doctor_blocks").select().order("start_time", { ascending: true });

  if (query.startBefore) builder = builder.lt("start_time", query.startBefore.toISOString());
  if (query.startFrom) builder = builder.gt("end_time", query.startFrom.toISOString());

  const { data, error } = await builder;
  if (error) throw new Error(`Failed to list doctor blocks: ${error.message}`);
  return (data as DoctorBlockRow[]).map(mapRow);
}
