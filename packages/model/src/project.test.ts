import type { AlignmentData } from '@bridge/alignment';
import { syntheticAlignmentData } from '@bridge/alignment/testing';
import { describe, expect, it } from 'vitest';
import type { z } from 'zod';
import { migrateProject } from './migrations.ts';
import { openProject, serializeProject } from './project.ts';
import { type AlignmentDataSchema, createEmptyProject, type ProjectFile } from './schema.ts';

function sampleProject(): ProjectFile {
  const project = createEmptyProject('Most SO 201');
  project.crs.origin = { x: -599900, y: -1199900, z: 0 };
  project.alignments.push(syntheticAlignmentData(undefined, 1000));
  project.parameters.push(
    { id: 'p1', name: 'h0', unit: 'length', law: { kind: 'constant', value: '1.0' } },
    {
      id: 'p2',
      name: 'h',
      unit: 'length',
      description: 'výška NK v osi',
      law: {
        kind: 'piecewise',
        segments: [
          { from: 1100, to: 1115, v0: 'h0 + 0.6', v1: 'h0', shape: 'parabolic', vertexAt: 'end' },
          { from: 1115, to: 1200, v0: 'h0', v1: 'h0', shape: 'linear' },
        ],
      },
    },
    {
      id: 'p3',
      name: 'skew',
      unit: 'angle',
      law: { kind: 'expression', expr: '10 + 0.01 * (sta - 1100)' },
    },
  );
  return project;
}

describe('project file', () => {
  it('keeps the zod schema in sync with AlignmentData', () => {
    // vzájomná priraditeľnosť: dáta z parsera LandXML idú do projektu a naopak
    const fromParser = (d: AlignmentData): z.infer<typeof AlignmentDataSchema> => d;
    const fromFile = (d: z.infer<typeof AlignmentDataSchema>): AlignmentData => d;
    expect([fromParser, fromFile]).toHaveLength(2);
  });

  it('saves and opens a project without loss', () => {
    const project = sampleProject();
    const text = serializeProject(project);
    const opened = openProject(text);
    expect(opened).toEqual({ ok: true, project });
    if (opened.ok) expect(serializeProject(opened.project)).toBe(text);
  });

  it('serializes deterministically regardless of key order in memory', () => {
    const a = sampleProject();
    const b = JSON.parse(JSON.stringify(a), (_k, v) =>
      v && typeof v === 'object' && !Array.isArray(v)
        ? Object.fromEntries(Object.entries(v).reverse())
        : v,
    ) as ProjectFile;
    expect(serializeProject(b)).toBe(serializeProject(a));
  });

  it('reports invalid JSON, unknown versions and schema violations with paths', () => {
    expect(openProject('{')).toMatchObject({ ok: false, issues: [{ code: 'InvalidJson' }] });
    expect(openProject('{"schemaVersion": "99"}')).toMatchObject({
      ok: false,
      issues: [{ code: 'UnsupportedSchemaVersion', version: '99' }],
    });
    const broken = JSON.parse(serializeProject(sampleProject()));
    broken.alignments[0].horizontal[2].radius = 'veľký';
    broken.parameters[1].law.segments[0].shape = 'kubická';
    const r = openProject(JSON.stringify(broken));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.issues.map((i) => (i.code === 'SchemaViolation' ? i.path : i.code))).toEqual([
        'alignments[0].horizontal[2].radius',
        'parameters[1].law.segments[0].shape',
      ]);
    }
  });
});

describe('migrateProject', () => {
  it('migrates a version 1 file (Phase 2) to the current schema', () => {
    const v1 = {
      schemaVersion: '1',
      name: 'Starý projekt',
      crs: { epsg: 5514, origin: null },
      alignments: [],
      parameters: [{ id: 'p', name: 'h0', unit: 'length', law: { kind: 'constant', value: '1' } }],
    };
    const r = openProject(JSON.stringify(v1));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.project.schemaVersion).toBe('5');
      expect(r.project.terrains).toEqual([]);
      expect(r.project.supports).toEqual([]);
      expect(r.project.bridgeAxes).toEqual([]);
      expect(r.project.parameters).toHaveLength(1);
    }
  });

  it('applies a chain of migrations up to the current version', () => {
    const migrations = {
      '0.1': {
        to: '0.2',
        migrate: (raw: Record<string, unknown>) => ({ ...raw, title: undefined, name: raw.title }),
      },
      '0.2': { to: '5', migrate: (raw: Record<string, unknown>) => ({ ...raw, parameters: [] }) },
    };
    const r = migrateProject({ schemaVersion: '0.1', title: 'Starý most' }, migrations);
    expect(r).toMatchObject({
      ok: true,
      raw: { schemaVersion: '5', name: 'Starý most', parameters: [] },
    });
  });

  it('adds a backwall and wings to version 3 abutments and keeps their dimensions', () => {
    const support = (geometry: Record<string, unknown>) => ({
      id: 'o1',
      name: 'O1',
      kind: 'abutment',
      superstructure: 'nk',
      station: 100,
      crossingAngle: '90',
      offset: '0',
      geometry,
      footing: { length: '13', width: '5', thickness: '1.2' },
      connection: 'bearing',
      bearingHeight: '0.35',
      bearings: ['-1.8', '1.8'],
      foundationTop: '240',
    });
    const v3 = {
      ...createEmptyProject('Opora v3'),
      schemaVersion: '3',
      supports: [
        support({ type: 'abutment', seatLength: '1.5', stemThickness: '1.2', length: '12' }),
        { ...support({ type: 'wall', thickness: '1.2', length: '4' }), id: 'p1', kind: 'pier' },
      ],
    };
    const r = openProject(JSON.stringify(v3));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const [abutment, pier] = r.project.supports;
    expect(abutment?.geometry).toMatchObject({
      type: 'abutment',
      seatLength: '1.5',
      stemThickness: '1.2',
      length: '12',
      gap: '0.08',
      wings: { angle: '0', support: 'hung' },
    });
    expect(pier?.geometry).toEqual({ type: 'wall', thickness: '1.2', length: '4' });
  });
});
