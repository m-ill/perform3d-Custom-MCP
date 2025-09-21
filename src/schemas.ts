import { z } from 'zod';

// Progress event schema
export const ProgressEventSchema = z.object({
  type: z.literal('progress'),
  token: z.string(),
  stage: z.string(),
  value: z.number().min(0).max(1),
  message: z.string().optional(),
});

// Command schemas
export const ConnectArgsSchema = z.object({}).optional();

export const OpenArgsSchema = z.object({
  path: z.string(),
});

export const NewFromTemplateArgsSchema = z.object({
  templatePath: z.string(),
  newPath: z.string(),
});

export const SaveAsArgsSchema = z.object({
  path: z.string(),
});

export const SetModelInfoArgsSchema = z.object({
  title: z.string().optional(),
  units: z.object({
    length: z.string().optional(),
    force: z.string().optional(),
  }).optional(),
});

export const NodeItemSchema = z.object({
  id: z.number(),
  x: z.number(),
  y: z.number(),
  z: z.number(),
});

export const AddNodesArgsSchema = z.object({
  items: z.array(NodeItemSchema),
});

export const ElementItemSchema = z.object({
  id: z.string(),
  type: z.enum(['beam', 'column', 'brace', 'wall', 'slab']),
  nodes: z.array(z.number()),
  property: z.string().optional(),
});

export const AddElementsArgsSchema = z.object({
  items: z.array(ElementItemSchema),
});

export const AddMaterialArgsSchema = z.object({
  name: z.string(),
  type: z.enum(['elastic', 'concrete', 'steel']),
  properties: z.record(z.number()),
});

export const AddCrossSectionArgsSchema = z.object({
  name: z.string(),
  shape: z.enum(['rectangle', 'circle', 'i-shape', 't-shape', 'channel']),
  dimensions: z.record(z.number()),
});

export const AddComponentArgsSchema = z.object({
  name: z.string(),
  type: z.enum(['elastic_beam', 'elastic_column', 'inelastic_beam', 'inelastic_column']),
  material: z.string(),
  section: z.string().optional(),
  hinges: z.object({
    start: z.string().optional(),
    end: z.string().optional(),
  }).optional(),
});

export const AssignPropertyArgsSchema = z.object({
  elements: z.array(z.string()),
  property: z.string(),
});

export const DefineLoadPatternArgsSchema = z.object({
  name: z.string(),
  type: z.enum(['dead', 'live', 'wind', 'seismic', 'other']),
  factor: z.number().optional(),
});

export const SetNodalLoadArgsSchema = z.object({
  nodeId: z.number(),
  pattern: z.string(),
  fx: z.number().optional(),
  fy: z.number().optional(),
  fz: z.number().optional(),
  mx: z.number().optional(),
  my: z.number().optional(),
  mz: z.number().optional(),
});

export const DefineSeriesArgsSchema = z.object({
  name: z.string(),
  type: z.enum(['gravity', 'pushover', 'time_history', 'modal']),
  loadPatterns: z.array(z.string()).optional(),
  controlNode: z.number().optional(),
  direction: z.string().optional(),
  duration: z.number().optional(),
  dt: z.number().optional(),
});

export const RunSeriesArgsSchema = z.object({
  name: z.string(),
  progressToken: z.string().optional(),
});

export const GetNodeDispArgsSchema = z.object({
  nodeId: z.number(),
  series: z.string(),
  step: z.number().optional(),
});

export const GetSupportReactionArgsSchema = z.object({
  series: z.string(),
  step: z.number().optional(),
});

export const GetElementShearArgsSchema = z.object({
  elementId: z.string().optional(),
  series: z.string(),
  step: z.number().optional(),
});

export const GetComponentUsageArgsSchema = z.object({
  series: z.string(),
  step: z.number().optional(),
});

export const GetPushoverCurveArgsSchema = z.object({
  series: z.string(),
});

export const GetTimeHistoryArgsSchema = z.object({
  series: z.string(),
  resultType: z.enum(['displacement', 'acceleration', 'base_shear', 'drift']),
  id: z.string().optional(),
});

export const ExportTableArgsSchema = z.object({
  tableType: z.string(),
  path: z.string(),
  series: z.string().optional(),
});

// Command argument schemas map
export const CommandSchemas: Record<string, z.ZodSchema> = {
  connect: ConnectArgsSchema,
  disconnect: z.object({}).optional(),
  open: OpenArgsSchema,
  new_from_template: NewFromTemplateArgsSchema,
  save: z.object({}).optional(),
  save_as: SaveAsArgsSchema,
  close: z.object({}).optional(),
  set_model_info: SetModelInfoArgsSchema,
  add_nodes: AddNodesArgsSchema,
  add_elements: AddElementsArgsSchema,
  add_material: AddMaterialArgsSchema,
  add_cross_section: AddCrossSectionArgsSchema,
  add_component: AddComponentArgsSchema,
  assign_property: AssignPropertyArgsSchema,
  define_load_pattern: DefineLoadPatternArgsSchema,
  set_nodal_load: SetNodalLoadArgsSchema,
  define_series: DefineSeriesArgsSchema,
  run_series: RunSeriesArgsSchema,
  get_node_disp: GetNodeDispArgsSchema,
  get_support_reaction: GetSupportReactionArgsSchema,
  get_element_shear: GetElementShearArgsSchema,
  get_component_usage: GetComponentUsageArgsSchema,
  get_pushover_curve: GetPushoverCurveArgsSchema,
  get_time_history: GetTimeHistoryArgsSchema,
  export_table: ExportTableArgsSchema,
};

// Response schemas
export const CommandResponseSchema = z.object({
  id: z.string(),
  ok: z.boolean(),
  data: z.any().optional(),
  error: z.object({
    code: z.string(),
    message: z.string(),
  }).optional(),
});

export const TableResultSchema = z.object({
  head: z.array(z.string()),
  data: z.array(z.array(z.string())),
});

export const CurveResultSchema = z.object({
  x: z.array(z.number()),
  y: z.array(z.number()),
  units: z.object({
    x: z.string(),
    y: z.string(),
  }).optional(),
  metadata: z.record(z.any()).optional(),
});

export const TimeHistoryResultSchema = z.object({
  t: z.array(z.number()),
}).and(z.record(z.array(z.number())));

// Type exports
export type ProgressEvent = z.infer<typeof ProgressEventSchema>;
export type CommandResponse = z.infer<typeof CommandResponseSchema>;
export type TableResult = z.infer<typeof TableResultSchema>;
export type CurveResult = z.infer<typeof CurveResultSchema>;
export type TimeHistoryResult = z.infer<typeof TimeHistoryResultSchema>;