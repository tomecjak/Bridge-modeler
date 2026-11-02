import type { AlignmentData } from '@bridge/alignment';
import { syntheticAlignmentData } from '@bridge/alignment/testing';
import { describe, expect, it } from 'vitest';
import type { z } from 'zod';
import { emptyBrief } from './brief.ts';
import { migrateProject } from './migrations.ts';
import { openProject, serializeProject } from './project.ts';
import { type AlignmentDataSchema, createEmptyProject, type ProjectFile } from './schema.ts';

function sampleProject(): ProjectFile {
  const project = createEmptyProject('Most SO 201');
  project.crs.origin = { x: -599900, y: -1199900, z: 0 };
  project.alignments.push(syntheticAlignmentData(undefined, 1000));
  project.brief.object = { number: '201-00', name: 'Most nad potokom' };
  project.brief.roadCategory = 'C 9,5/70';
  project.brief.bridgeType = 'road';
  project.studyArea = { alignment: project.alignments[0]?.name ?? '', from: 1100, to: 1250 };
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
      expect(r.project.schemaVersion).toBe('16');
      expect(r.project.variants.map((v) => v.name)).toEqual(['Variant A']);
      expect(r.project.edgeBeams).toEqual([]);
      expect(r.project.obstacles).toEqual([]);
      expect(r.project.surveys).toEqual([]);
      expect(r.project.bearingLines).toEqual([]);
      expect(r.project.studyArea).toBeNull();
      expect(r.project.brief.roadCategory).toBe('');
      expect(r.project.terrains).toEqual([]);
      expect(r.project.planLines).toEqual([]);
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
      '0.2': { to: '16', migrate: (raw: Record<string, unknown>) => ({ ...raw, parameters: [] }) },
    };
    const r = migrateProject({ schemaVersion: '0.1', title: 'Starý most' }, migrations);
    expect(r).toMatchObject({
      ok: true,
      raw: { schemaVersion: '16', name: 'Starý most', parameters: [] },
    });
  });

  it('gives every version 7 support its own bearing line with its station and crossing angle', () => {
    const { bearingLines: _lines, ...empty } = createEmptyProject('Most v7');
    const v7 = {
      ...empty,
      schemaVersion: '7',
      supports: [
        {
          id: 'o1',
          name: 'O1',
          kind: 'abutment',
          superstructure: 'nk',
          station: 1020.5,
          crossingAngle: 'alpha',
          offset: '0',
          geometry: { type: 'wall', thickness: '1.2', length: '4' },
          footing: { length: '8', width: '4', thickness: '1.2' },
          connection: 'bearing',
          bearingHeight: '0.35',
          bearings: ['-1.8', '1.8'],
          foundationTop: '240',
        },
      ],
    };
    const r = openProject(JSON.stringify(v7));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.project.bearingLines).toEqual([
      { id: 'bl-o1', name: 'O1', superstructure: 'nk', station: 1020.5, crossingAngle: 'alpha' },
    ]);
    expect(r.project.supports[0]).toMatchObject({ id: 'o1', bearingLine: 'bl-o1' });
    expect(r.project.supports[0]).not.toHaveProperty('station');
    expect(r.project.supports[0]).not.toHaveProperty('superstructure');
  });

  it('measures version 8 abutment dimensions along the bridge axis and derives the deck ends', () => {
    const abutment = (id: string, line: string, front: string) => ({
      id,
      name: id,
      kind: 'abutment',
      bearingLine: line,
      offset: '0',
      geometry: {
        type: 'abutment',
        length: '20',
        seatLength: '1.807',
        seatHeight: '1.1',
        frontOffset: front,
        stemThickness: '1.2',
        backwallThickness: '0.5',
        gap: '0.08',
        wings: { angle: '0', length: '4', thickness: '0.6', support: 'hung', endHeight: '1.5' },
      },
      footing: { length: '0', width: '0', thickness: '0' },
      connection: 'bearing',
      bearingHeight: '0.45',
      bearings: ['-1.25', '1.25'],
      foundationTop: '315',
    });
    const v8 = {
      ...createEmptyProject('Most v8'),
      schemaVersion: '8',
      superstructures: [
        {
          id: 'nk',
          name: 'NK',
          bridgeAxis: 'ax',
          from: 9307.31,
          to: 9363.31,
          profile: 'p',
          parameterLaws: {},
          orientation: 'vertical',
        },
      ],
      bearingLines: [
        { id: 'l1', name: '1', superstructure: 'nk', station: 9307.81, crossingAngle: '30' },
        { id: 'l2', name: '2', superstructure: 'nk', station: 9335, crossingAngle: '90' },
        { id: 'l3', name: '3', superstructure: 'nk', station: 9362.81, crossingAngle: 'alfa' },
      ],
      supports: [abutment('o1', 'l1', '0.45'), abutment('o2', 'l3', '0.9')],
    };
    const r = openProject(JSON.stringify(v8));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.project.superstructures[0]?.ends).toEqual({ start: 'abutment', end: 'abutment' });
    const [o1, o2] = r.project.supports.map((s) => s.geometry);
    // kolmo na os opory → v osi mosta: ÷ sin 30° = × 2
    expect(o1).toMatchObject({
      construction: 'bearing',
      frontOffset: '0.9',
      backwallThickness: '1',
      stemThickness: '2.4',
      endOffset: '0.5',
      gap: '0.08',
      wallThickness: '1.2',
    });
    expect(o1).not.toHaveProperty('seatLength');
    // uhol zadaný výrazom → výraz
    expect(o2).toMatchObject({ frontOffset: '(0.9) / sin(alfa)', endOffset: '0.5' });
  });

  it('turns the version 9 footing top into the foundation level below the footing', () => {
    const support = (id: string, kind: string, top: string, thickness: string) => ({
      id,
      name: id,
      kind,
      bearingLine: `l-${id}`,
      offset: '0',
      geometry: { type: 'wall', thickness: '1.2', length: '4' },
      footing: { length: '8', width: '4', thickness },
      connection: 'bearing',
      bearingHeight: '0.35',
      bearings: ['-1.8', '1.8'],
      foundationTop: top,
    });
    const v9 = {
      ...createEmptyProject('Most v9'),
      schemaVersion: '9',
      supports: [
        support('p1', 'pier', '311.07', '1.5'),
        support('o1', 'abutment', '315.672', '0'),
        support('p2', 'pier', 'z0 - 8', 't'),
        support('p3', 'pier', 'z0 - 8', '0'),
      ],
    };
    const r = openProject(JSON.stringify(v9));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const [p1, o1, p2, p3] = r.project.supports;
    expect(p1?.foundation).toEqual({ mode: 'level', cover: '0.5', height: '8', level: '309.57' });
    expect(o1?.foundation).toEqual({ mode: 'level', cover: '0.5', height: '4', level: '315.672' });
    expect(p2?.foundation.level).toBe('(z0 - 8) - (t)');
    expect(p3?.foundation.level).toBe('z0 - 8');
    expect(p1).not.toHaveProperty('foundationTop');
  });

  it('marks the first version 10 terrain for the support foundations', () => {
    const surface = (id: string) => ({
      id,
      name: id,
      source: 'landxml',
      corridor: { halfWidth: 60, margin: 50 },
      data: { kind: 'tin', points: [], triangles: [] },
    });
    const v10 = {
      ...createEmptyProject('Most v10'),
      schemaVersion: '10',
      terrains: [surface('povrch'), surface('htu')],
    };
    const r = openProject(JSON.stringify(v10));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.project.terrains.map((t) => t.foundation)).toEqual([true, undefined]);
  });

  it('makes the bridge elements of a version 15 file the active variant A', () => {
    const {
      variants: _variants,
      activeVariant: _active,
      ...v15
    } = { ...createEmptyProject('Most v15'), schemaVersion: '15' };
    v15.parameters = [
      { id: 'p', name: 'h0', unit: 'length', law: { kind: 'constant', value: '1' } },
    ];
    const r = openProject(JSON.stringify(v15));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.project.activeVariant).toBe('variant-a');
    expect(r.project.variants).toEqual([{ id: 'variant-a', name: 'Variant A', parameters: {} }]);
    expect(r.project.parameters).toHaveLength(1);
  });

  it('adds no edge beams to version 14 files and keeps edge beams with the required free width', () => {
    const { edgeBeams: _beams, ...v14 } = {
      ...createEmptyProject('Most v14'),
      schemaVersion: '14',
    };
    const old = openProject(JSON.stringify(v14));
    expect(old.ok && old.project.edgeBeams).toEqual([]);

    const project = createEmptyProject('Most s rímsami');
    project.superstructures.push({
      id: 'nk',
      name: 'NK',
      bridgeAxis: 'os',
      from: 0,
      to: 30,
      profile: 'pr',
      parameterLaws: {},
      orientation: 'vertical',
      freeWidth: 12.75,
    });
    project.edgeBeams.push({
      id: 'r1',
      name: 'Rímsa vľavo',
      superstructure: 'nk',
      side: 'left',
      profile: 'rimsa',
      parameterLaws: { b: { kind: 'constant', value: '1.75' } },
    });
    expect(openProject(serializeProject(project))).toEqual({ ok: true, project });
  });

  it('adds an empty brief and no study area to version 6 files', () => {
    const {
      brief: _brief,
      studyArea: _studyArea,
      ...v6
    } = {
      ...createEmptyProject('Most v6'),
      schemaVersion: '6',
    };
    const r = openProject(JSON.stringify(v6));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.project.brief).toEqual(emptyBrief());
    expect(r.project.studyArea).toBeNull();
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
      construction: 'bearing',
      stemThickness: '1.2',
      length: '12',
      gap: '0.08',
      wings: { angle: '0', support: 'hung' },
    });
    expect(pier?.geometry).toEqual({ type: 'wall', thickness: '1.2', length: '4' });
  });
});
