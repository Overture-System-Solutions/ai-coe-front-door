/**
 * JSON Schema files for the three Marketing payloads and the shared envelope: additionalProperties false,
 * so extra identity or delivery keys are refused at the published contract as well as in the runtime parsers.
 */
import * as fs from 'fs';
import * as path from 'path';

const DIR: string = path.join(process.cwd(), 'src/webparts/aiCoeFrontDoor/content/marketing/schemas');

const FILES: string[] = [
  'artifact-envelope.v1.json',
  'campaign-brief.v1.json',
  'content-plan.v1.json',
  'meeting-follow-through.v1.json'
];

describe('Marketing JSON Schemas', () => {
  it('ships four strict schemas that refuse extra properties', () => {
    for (const file of FILES) {
      const schema: { additionalProperties?: boolean; title?: string } = JSON.parse(
        fs.readFileSync(path.join(DIR, file), 'utf8')
      ) as { additionalProperties?: boolean; title?: string };
      expect({ file, additionalProperties: schema.additionalProperties }).toEqual({ file, additionalProperties: false });
      expect(schema.title).toBeDefined();
    }
  });
});
