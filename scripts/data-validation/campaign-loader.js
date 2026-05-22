/**
 * Campaign input loader & validator.
 *
 * A campaign file describes a fix the curator wants applied (issue #137 design).
 * The validator and applier read these files; everything in the pipeline keys
 * off the schema below, so failing to load a campaign blocks all downstream work.
 */

import fs from 'fs';
import path from 'path';
import Joi from 'joi';

const QID = Joi.string().pattern(/^Q\d+$/);
const YEAR = Joi.number().integer().min(-13000).max(2100);

const overwriteAllowlist = Joi.object({
  ruler: Joi.array().items(Joi.string()).optional(),
  culture: Joi.array().items(Joi.string()).optional(),
  religion: Joi.array().items(Joi.string()).optional(),
  capital: Joi.array().items(Joi.string()).optional()
});

const polityCampaign = Joi.object({
  type: Joi.string().valid('polity').required(),
  name: Joi.string().required(),
  wikidataQid: QID.required(),
  yearStart: YEAR.required(),
  yearEnd: YEAR.required(),
  chronasProvinces: Joi.array().items(Joi.string()).min(1).required(),
  proposedRulerCode: Joi.string().pattern(/^[A-Z0-9_]{2,8}$/).required(),
  color: Joi.string().pattern(/^rgb\(\d+,\s*\d+,\s*\d+\)$/).optional(),
  wikiSlug: Joi.string().optional(),
  flag: Joi.string().optional(),
  capital: Joi.object({
    name: Joi.string().required(),
    lat: Joi.number().required(),
    lon: Joi.number().required()
  }).optional(),
  // Authorise replacement of existing values listed here. Default is
  // fill-empty-only.
  overwrite: overwriteAllowlist.optional(),
  citations: Joi.array().items(Joi.object({
    source: Joi.string().required(),
    url: Joi.string().uri().optional(),
    page: Joi.string().optional()
  })).default([])
});

const cultureCampaign = Joi.object({
  type: Joi.string().valid('culture').required(),
  name: Joi.string().required(),
  wikidataQid: QID.required(),
  yearStart: YEAR.required(),
  yearEnd: YEAR.required(),
  chronasKey: Joi.string().pattern(/^[a-z0-9_-]+$/).required(),
  areaScope: Joi.string().valid('full', 'none', 'partial').required(),
  chronasProvinces: Joi.array().items(Joi.string()).when('areaScope', {
    is: 'none',
    then: Joi.forbidden(),
    otherwise: Joi.required()
  }),
  color: Joi.string().pattern(/^rgb\(\d+,\s*\d+,\s*\d+\)$/).optional(),
  wikiSlug: Joi.string().optional(),
  flag: Joi.string().optional(),
  overwrite: overwriteAllowlist.optional(),
  citations: Joi.array().items(Joi.object({
    source: Joi.string().required(),
    url: Joi.string().uri().optional()
  })).default([])
});

const markerCampaign = Joi.object({
  type: Joi.string().valid('marker').required(),
  name: Joi.string().required(),
  wikidataQid: QID.optional(),
  wikiSlug: Joi.string().optional(),
  markerType: Joi.string().valid('a', 'at', 'e', 'm', 'op', 'p', 'r', 's', 'c', 'ca', 'w').required(),
  year: YEAR.required(),
  end: YEAR.optional(),
  coo: Joi.array().length(2).items(Joi.number()).required(),
  rulerCode: Joi.string().optional(),
  html: Joi.string().optional(),
  citations: Joi.array().items(Joi.object({
    source: Joi.string().required(),
    url: Joi.string().uri().optional()
  })).default([])
});

const manualEntity = Joi.object({
  scope: Joi.string().valid('marker', 'metadata', 'area').required(),
  reason: Joi.string().required(),
  citations: Joi.array().items(Joi.object({
    source: Joi.string().required(),
    url: Joi.string().uri().optional()
  })).min(1).required(),
  payload: Joi.object().unknown(true).required()
});

const TYPE_SCHEMAS = {
  polity: polityCampaign,
  culture: cultureCampaign,
  marker: markerCampaign
};

const topLevelSchema = Joi.object({
  issue: Joi.number().integer().required(),
  title: Joi.string().required(),
  campaigns: Joi.array().items(Joi.object({ type: Joi.string().required() }).unknown(true)).min(1).required(),
  manualEntities: Joi.array().items(manualEntity).default([])
}).unknown(false);

function describeErrors(error) {
  return error.details.map(d => `  - ${d.path.join('.')}: ${d.message}`).join('\n');
}

export function loadCampaign(filePath) {
  const abs = path.resolve(filePath);
  if (!fs.existsSync(abs)) {
    throw new Error(`Campaign file not found: ${abs}`);
  }
  const raw = JSON.parse(fs.readFileSync(abs, 'utf8'));

  const top = topLevelSchema.validate(raw, { abortEarly: false, convert: false });
  if (top.error) {
    throw new Error(`Invalid campaign file ${path.basename(abs)}:\n${describeErrors(top.error)}`);
  }

  const validatedCampaigns = [];
  for (let i = 0; i < raw.campaigns.length; i++) {
    const c = raw.campaigns[i];
    const schema = TYPE_SCHEMAS[c.type];
    if (!schema) {
      throw new Error(`Invalid campaign file ${path.basename(abs)}:\n  - campaigns[${i}].type: must be one of polity|culture|marker (got "${c.type}")`);
    }
    const r = schema.validate(c, { abortEarly: false, convert: false });
    if (r.error) {
      const detail = r.error.details.map(d => `  - campaigns[${i}].${d.path.join('.')}: ${d.message}`).join('\n');
      throw new Error(`Invalid campaign file ${path.basename(abs)}:\n${detail}`);
    }
    validatedCampaigns.push(r.value);
  }

  return {
    issue: top.value.issue,
    title: top.value.title,
    campaigns: validatedCampaigns,
    manualEntities: top.value.manualEntities || []
  };
}

export const _schemas = { topLevelSchema, polityCampaign, cultureCampaign, markerCampaign };
