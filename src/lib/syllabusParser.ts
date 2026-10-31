import type { Subject, Unit, SubTopic } from '../types';
import { getLocalDateStr } from './utils';

export interface ParsedSyllabus {
  subjects: Subject[];
  stats: { subjects: number; units: number; topics: number; easy: number; medium: number; hard: number };
}

const COLORS = ['#3B82F6', '#8B5CF6', '#10B981', '#F97316', '#EC4899', '#06B6D4', '#EF4444', '#84CC16', '#F59E0B', '#14B8A6'];
let counter = 0;
const uid = () => `imp-${Date.now()}-${++counter}-${Math.random().toString(36).slice(2, 5)}`;

const makeTopic = (name: string, diff: 'Easy' | 'Medium' | 'Hard', opts?: { important?: boolean; module?: string; subModule?: string; topicNumber?: number }): SubTopic => ({
  id: uid(), name, completed: false, notes: '', difficulty: diff,
  timeSpent: 0, important: opts?.important ?? diff === 'Hard',
  module: opts?.module, subModule: opts?.subModule, topicNumber: opts?.topicNumber,
});

/** Strip tree-drawing characters: ├── │ └── etc. */
function stripTree(line: string): string {
  return line.replace(/^[\s│├└─┌┐┘┤┬┴┼|+\-\\/]+/g, '').trim();
}

// ===== Hierarchical Emoji Format Parser (1️⃣2️⃣3️⃣4️⃣) =====

interface TreeNode {
  level: number;
  name: string;
  children: TreeNode[];
}

function detectEmojiFormat(text: string): boolean {
  return /1️⃣|2️⃣|3️⃣|4️⃣/.test(text);
}

function parseEmojiHierarchy(text: string): ParsedSyllabus {
  counter = 0;
  const lines = text.split('\n').filter(l => l.trim());
  const stats = { subjects: 0, units: 0, topics: 0, easy: 0, medium: 0, hard: 0 };

  // Extract subject name if present
  let subjectName = 'Imported Subject';
  const subjectLine = lines.find(l => /^SUBJECT\s*:/i.test(l.trim()));
  if (subjectLine) {
    subjectName = subjectLine.replace(/^SUBJECT\s*:\s*/i, '').trim() || subjectName;
  }

  // Parse tree nodes
  const units: { name: string; nodes: TreeNode[] }[] = [];
  let currentUnit: { name: string; nodes: TreeNode[] } | null = null;
  let currentL2: TreeNode | null = null;
  let currentL3: TreeNode | null = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (/^SUBJECT\s*:/i.test(line)) continue;
    if (!line || /^[-═─]+$/.test(line)) continue;

    // Detect level from emoji
    let level = 0;
    let name = line;
    if (/1️⃣/.test(line)) {
      level = 1;
      name = line.replace(/1️⃣\s*/, '').trim();
    } else if (/2️⃣/.test(line)) {
      level = 2;
      name = line.replace(/2️⃣\s*/, '').trim();
    } else if (/3️⃣/.test(line)) {
      level = 3;
      name = line.replace(/3️⃣\s*/, '').trim();
    } else if (/4️⃣/.test(line)) {
      level = 4;
      name = line.replace(/4️⃣\s*/, '').trim();
    } else {
      continue; // Skip lines without emoji markers
    }

    if (!name) continue;

    if (level === 1) {
      currentUnit = { name, nodes: [] };
      units.push(currentUnit);
      currentL2 = null;
      currentL3 = null;
      stats.units++;
    } else if (level === 2) {
      if (!currentUnit) {
        currentUnit = { name: 'Unit 1', nodes: [] };
        units.push(currentUnit);
        stats.units++;
      }
      currentL2 = { level: 2, name, children: [] };
      currentUnit.nodes.push(currentL2);
      currentL3 = null;
    } else if (level === 3) {
      const node: TreeNode = { level: 3, name, children: [] };
      if (currentL2) {
        currentL2.children.push(node);
      } else if (currentUnit) {
        currentUnit.nodes.push(node);
      }
      currentL3 = node;
    } else if (level === 4) {
      const node: TreeNode = { level: 4, name, children: [] };
      if (currentL3) {
        currentL3.children.push(node);
      } else if (currentL2) {
        currentL2.children.push(node);
      } else if (currentUnit) {
        currentUnit.nodes.push(node);
      }
    }
  }

  // Convert tree to flat SubTopics with module/subModule
  const subjectUnits: Unit[] = [];

  for (const unit of units) {
    const subTopics: SubTopic[] = [];

    const collectLeaves = (nodes: TreeNode[], moduleName?: string, subModuleName?: string) => {
      for (const node of nodes) {
        if (node.children.length === 0) {
          // This is a leaf node — create a SubTopic
          const diff: 'Easy' | 'Medium' | 'Hard' = 'Medium';
          subTopics.push(makeTopic(node.name, diff, { module: moduleName, subModule: subModuleName }));
          stats.topics++;
          stats.medium++;
        } else {
          // This is a branch — its name becomes module or subModule
          if (node.level === 2) {
            collectLeaves(node.children, node.name, undefined);
          } else if (node.level === 3) {
            collectLeaves(node.children, moduleName, node.name);
          } else {
            collectLeaves(node.children, moduleName, subModuleName);
          }
        }
      }
    };

    // Check if all L2 nodes have children — if a L2 node has no children, it's a leaf
    collectLeaves(unit.nodes);

    subjectUnits.push({ id: uid(), name: unit.name, subTopics });
  }

  const shortName = subjectName.length > 12
    ? subjectName.replace(/\b(and|of|the|in|for|to|&)\b/gi, '').trim().split(/\s+/).map(w => w[0]).join('').slice(0, 6).toUpperCase()
    : subjectName.slice(0, 12);

  const subject: Subject = {
    id: uid(), name: subjectName, shortName,
    color: COLORS[0],
    examDate: getLocalDateStr(new Date(Date.now() + 90 * 86400000)),
    units: subjectUnits,
  };

  stats.subjects = 1;
  return { subjects: [subject], stats };
}

// ===== Original Format Parser =====

export function parseSyllabusText(text: string): ParsedSyllabus {
  // Check if it's the emoji hierarchy format
  if (detectEmojiFormat(text)) {
    return parseEmojiHierarchy(text);
  }

  counter = 0;
  const rawLines = text.split('\n');
  const lines = rawLines
    .map(l => stripTree(l))
    .filter(l => l && !l.startsWith('═') && !l.startsWith('---') && l !== '.');

  const subjects: Subject[] = [];
  let curSubject: Subject | null = null;
  let curUnit: Unit | null = null;
  let curTopicName = '';
  let curTopicDiff: 'Easy' | 'Medium' | 'Hard' = 'Medium';
  let curModule: string | undefined = undefined;
  let topicPrefix = '';
  const stats = { subjects: 0, units: 0, topics: 0, easy: 0, medium: 0, hard: 0 };
  const diffMap: Record<string, 'Easy' | 'Medium' | 'Hard'> = { E: 'Easy', M: 'Medium', H: 'Hard' };

  const ensureSubject = () => {
    if (!curSubject) {
      curSubject = {
        id: uid(), name: 'Imported Subject', shortName: 'IMP',
        color: COLORS[stats.subjects % COLORS.length],
        examDate: getLocalDateStr(new Date(Date.now() + 90 * 86400000)),
        units: [],
      };
      subjects.push(curSubject);
      stats.subjects++;
    }
  };

  const ensureUnit = () => {
    ensureSubject();
    if (!curUnit) {
      curUnit = { id: uid(), name: 'Unit 1: Topics', subTopics: [] };
      curSubject!.units.push(curUnit);
      stats.units++;
    }
  };

  const addTopicStat = (diff: 'Easy' | 'Medium' | 'Hard') => {
    stats.topics++;
    if (diff === 'Easy') stats.easy++;
    else if (diff === 'Medium') stats.medium++;
    else stats.hard++;
  };

  for (const line of lines) {
    // ── SUBJECT line ──
    if (/^SUBJECT\s*:/i.test(line)) {
      const name = line.replace(/^SUBJECT\s*:\s*/i, '').trim();
      if (!name) continue;
      curSubject = {
        id: uid(), name, shortName: name.length > 12 ? name.replace(/\b(and|of|the|in|for|to|&)\b/gi, '').trim().split(/\s+/).map(w => w[0]).join('').slice(0, 6).toUpperCase() : name.slice(0, 12),
        color: COLORS[stats.subjects % COLORS.length],
        examDate: getLocalDateStr(new Date(Date.now() + 90 * 86400000)),
        units: [],
      };
      subjects.push(curSubject);
      stats.subjects++;
      curUnit = null;
      topicPrefix = '';
      curTopicName = '';
      curModule = undefined;
      continue;
    }

    // ── UNIT line ──
    if (/^UNIT\s*\d*/i.test(line) || /^Unit\s+\d+\s*:/i.test(line)) {
      const match = line.match(/^(?:UNIT|Unit)\s*(\d+)\s*:\s*(.+)/i);
      // Strip serial numbers — app auto-numbers units
      const rawName = match ? match[2].trim() : line.replace(/^(?:UNIT|Unit)\s*\d*\s*:?\s*/i, '').trim();
      const unitName = rawName || line;
      ensureSubject();
      curUnit = { id: uid(), name: unitName, subTopics: [] };
      curSubject!.units.push(curUnit);
      topicPrefix = '';
      curTopicName = '';
      curModule = undefined;
      stats.units++;
      continue;
    }

    // ── MODULE line: [M] MODULE_NAME ──
    const moduleMatch = line.match(/^\[M\]\s*(.+)/i);
    if (moduleMatch) {
      curModule = moduleMatch[1].trim().replace(/\s*\(.*\)$/, '').trim() || moduleMatch[1].trim();
      continue;
    }

    // ── TOPIC prefix line ──
    if (/^TOPIC\s*:/i.test(line)) {
      topicPrefix = line.replace(/^TOPIC\s*:\s*/i, '').trim();
      continue;
    }

    // ── Numbered topic: #NNN Topic Name ──
    const numberedMatch = line.match(/^#(\d+)\s+(.+)/);
    if (numberedMatch) {
      const topicNum = parseInt(numberedMatch[1], 10);
      const rawName = numberedMatch[2].trim().replace(/\s*---\s*/g, ' — ');
      const name = topicPrefix ? `${topicPrefix}: ${rawName}` : rawName;

      let diff: 'Easy' | 'Medium' | 'Hard' = 'Medium';
      const lowerName = name.toLowerCase();
      if (lowerName.includes('basic') || lowerName.includes('introduction') || lowerName.includes('terminolog')) diff = 'Easy';
      if (lowerName.includes('anomal') || lowerName.includes('abnormal') || lowerName.includes('complicat') || lowerName.includes('contracted')) diff = 'Hard';

      ensureUnit();
      curUnit!.subTopics.push(makeTopic(name, diff, { module: curModule, topicNumber: topicNum }));
      curTopicName = rawName;
      curTopicDiff = diff;
      addTopicStat(diff);
      continue;
    }

    // ── Difficulty-tagged topic line: [E], [H] ──
    const diffMatch = line.match(/^\[(E|H)\]\s*(.+)/i);
    if (diffMatch) {
      const diff = diffMap[diffMatch[1].toUpperCase()];
      const rawName = diffMatch[2].trim();
      const name = topicPrefix ? `${topicPrefix}: ${rawName}` : rawName;

      ensureUnit();
      curUnit!.subTopics.push(makeTopic(name, diff, { module: curModule }));
      curTopicName = rawName;
      curTopicDiff = diff;
      addTopicStat(diff);
      continue;
    }

    // ── Difficulty-tagged with [M] that's NOT a module header ──
    const diffMMatch = line.match(/^\[M\]\s*#(\d+)\s+(.+)/i);
    if (diffMMatch) {
      const topicNum = parseInt(diffMMatch[1], 10);
      const rawName = diffMMatch[2].trim().replace(/\s*---\s*/g, ' — ');
      ensureUnit();
      curUnit!.subTopics.push(makeTopic(rawName, 'Medium', { module: curModule, topicNumber: topicNum }));
      addTopicStat('Medium');
      continue;
    }

    // Legacy [M] as difficulty
    const legacyMDiff = line.match(/^\[M\]\s+(.+)/i);
    if (legacyMDiff && !line.match(/^\[M\]\s+[A-Z]{2}/)) {
      const rawName = legacyMDiff[1].trim();
      const isModuleName = rawName === rawName.toUpperCase() && rawName.length > 3 && !/^#\d+/.test(rawName);
      if (!isModuleName) {
        const name = topicPrefix ? `${topicPrefix}: ${rawName}` : rawName;
        ensureUnit();
        curUnit!.subTopics.push(makeTopic(name, 'Medium', { module: curModule }));
        curTopicName = rawName;
        curTopicDiff = 'Medium';
        addTopicStat('Medium');
        continue;
      }
    }

    // ── Sub-part line ──
    const partMatch = line.match(/^#(\d+)\s*(.*)/);
    if (partMatch && curUnit && curTopicName) {
      const partLabel = partMatch[2].trim();
      const name = partLabel
        ? `${curTopicName} — ${partLabel}`
        : `${curTopicName} — #${partMatch[1]}`;
      curUnit.subTopics.push(makeTopic(name, curTopicDiff, { module: curModule }));
      addTopicStat(curTopicDiff);
      continue;
    }
  }

  // Deduplicate
  for (const subj of subjects) {
    for (const unit of subj.units) {
      const parentNames = new Set<string>();
      for (const t of unit.subTopics) {
        const dashIdx = t.name.indexOf(' — ');
        if (dashIdx > -1) parentNames.add(t.name.slice(0, dashIdx));
      }
      if (parentNames.size > 0) {
        unit.subTopics = unit.subTopics.filter(t => {
          if (parentNames.has(t.name)) {
            stats.topics--;
            if (t.difficulty === 'Easy') stats.easy--;
            else if (t.difficulty === 'Medium') stats.medium--;
            else stats.hard--;
            return false;
          }
          return true;
        });
      }
    }
  }

  return { subjects, stats };
}

// ===== Templates =====

export const PHARMACOLOGY_TEMPLATE = `SUBJECT: Pharmacology
UNIT 1: General Pharmacology
TOPIC: Pharmacokinetics
[E] Absorption
[E] Distribution
[M] Metabolism
[M] Excretion
[H] First Pass Effect
[H] Volume of Distribution
TOPIC: Pharmacodynamics
[E] Drug Receptors
[E] Agonists
[M] Antagonists
[M] Dose Response Curve
[H] Therapeutic Index
[H] Receptor Regulation
══════════════════════════════════
UNIT 2: Autonomic Nervous System
TOPIC: Cholinergic Drugs
[E] Classification
[E] Mechanism of Action
[M] Uses
[M] Adverse Effects
[H] Organophosphorus Poisoning
[H] Antidote Management
TOPIC: Anticholinergic Drugs
[E] Atropine
[E] Glycopyrrolate
[M] Uses
[M] Contraindications
[H] Atropine Toxicity
[H] Drug Interactions
══════════════════════════════════
UNIT 3: Drugs Acting on CNS
TOPIC: General Anesthetics
[E] Classification
[E] Stages of Anesthesia
[M] Inhalational Agents
[M] IV Agents
[H] Malignant Hyperthermia
[H] Balanced Anesthesia
TOPIC: Sedatives and Hypnotics
[E] Benzodiazepines
[E] Classification
[M] Mechanism of Action
[M] Clinical Uses
[H] Dependence and Withdrawal
[H] Flumazenil`;

export const TREE_FORMAT_TEMPLATE = `SUBJECT: Obstetrics & Gynecology

├── Unit 2: Reproductive Science
│   ├── [M] BASICS OF REPRODUCTION
│   │   ├── #097 Gametogenesis, Fertilization & Implantation (Part-1)
│   │   ├── #098 Gametogenesis, Fertilization & Implantation (Part-2)
│   │   ├── #099 Placenta (Part-1)
│   │   ├── #100 Placenta (Part-2)
│   │   ├── #101 Placental Anomalies
│   │   ├── #102 Hormones Formed by Placenta & Umbilical Cord
│   │   ├── #103 Amniotic Fluid — Normal & Abnormal (Part-1)
│   │   ├── #104 Amniotic Fluid — Normal & Abnormal (Part-2)
│   │   ├── #105 Amniotic Fluid — Normal & Abnormal (Part-3)
│   │   ├── #106 Fetus (Part-1)
│   │   └── #107 Fetus (Part-2)
│
├── Unit 3: Normal Obstetrics - Pregnancy, Labor & Delivery
│   ├── [M] PRE-PREGNANCY CARE (Antenatal Care)
│   │   ├── #108 Basics of Pregnancy (Part-1)
│   │   ├── #109 Basics of Pregnancy (Part-2)
│   │   ├── #110 Antenatal Care (ANC)
│   │   ├── #111 USG in Pregnancy
│   │   └── #112 Down Syndrome
│   │
│   ├── [M] NORMAL PREGNANCY — Maternal Adaptation
│   │   ├── #113 Maternal Adaptation in Pregnancy (Part-1)
│   │   ├── #114 Maternal Adaptation in Pregnancy (Part-2)
│   │   ├── #115 Maternal Adaptation in Pregnancy (Part-3)
│   │   └── #116 Maternal Adaptation in Pregnancy (Part-4)
│   │
│   ├── [M] ANATOMY RELATED TO LABOR
│   │   ├── #139 Pelvis — 1A (Anatomy of Pelvic Girdle)
│   │   ├── #140 Pelvis — 1B (Anatomy of Pelvic Girdle)
│   │   ├── #141 Pelvis — 2 (Maternal Pelvis, Types & Diameters)
│   │   ├── #142 Pelvis — 3 (Contracted Pelvis)
│   │   └── #143 Fetal Skull (Diameters, Fontanelles, Sutures)
│   │
│   ├── [M] NORMAL LABOR
│   │   ├── #144 Terminologies Related to Labor (Part-1)
│   │   ├── #145 Terminologies Related to Labor (Part-2)
│   │   ├── #146 Normal Labor (Part-1A) — Mechanism
│   │   ├── #147 Normal Labor (Part-1B)
│   │   ├── #148 Normal Labor (Part-1C)
│   │   ├── #149 Normal Labor (Part-1D)
│   │   ├── #150 Normal Labor (Part-2)
│   │   ├── #151 Management of 3rd Stage of Labor
│   │   ├── #152 Induction of Labor
│   │   └── #153 Partogram`;

export const HIERARCHY_TEMPLATE = `SUBJECT: Anatomy & Physiology

1️⃣ Human Body Systems
 2️⃣ Respiratory System
  3️⃣ Upper Respiratory Tract
   4️⃣ Nose
   4️⃣ Nostrils
   4️⃣ Nasal Cavity
   4️⃣ Pharynx
  3️⃣ Lower Respiratory Tract
   4️⃣ Larynx
   4️⃣ Trachea
   4️⃣ Bronchi
   4️⃣ Lungs
 2️⃣ Digestive System
  3️⃣ Alimentary Canal
   4️⃣ Mouth
   4️⃣ Pharynx
   4️⃣ Esophagus
   4️⃣ Stomach
   4️⃣ Small Intestine
   4️⃣ Large Intestine
  3️⃣ Accessory Organs
   4️⃣ Salivary Glands
   4️⃣ Liver
   4️⃣ Gallbladder
   4️⃣ Pancreas

1️⃣ Cardiovascular System
 2️⃣ Heart
  3️⃣ Chambers of Heart
  3️⃣ Heart Valves
  3️⃣ Conducting System
 2️⃣ Blood Vessels
  3️⃣ Arteries
  3️⃣ Veins
  3️⃣ Capillaries`;

// ===== AI Prompt Template for Download =====
export const AI_PROMPT_TEMPLATE = `# Study Tracker — Hierarchical Syllabus Generator

You are a precise syllabus structure generator. Convert the given syllabus, PDF, notes, textbook index, lecture list, YouTube playlist, or study roadmap into a hierarchical folder structure.

## Output Format (STRICT)

Use these exact emoji markers for each level:

1️⃣ = Main Unit / Folder (Level 1)
 2️⃣ = Major Topic (Level 2)
  3️⃣ = Subtopic (Level 3)
   4️⃣ = Micro-topic / Component / Concept (Level 4)

Add "SUBJECT: <Name>" as the very first line.

## Rules (Follow EXACTLY)

1. Follow the exact hierarchy from the source material.
2. Create ONLY the levels that actually exist — do NOT force all 4 levels.
3. Some units may stop at 2️⃣ level. That's fine.
4. Some topics may go to 3️⃣ level only. That's fine.
5. Some topics may contain 4️⃣ level. That's fine.
6. Preserve the parent-child relationship exactly as in the source.
7. Think like a collapsible folder tree / file explorer.
8. Keep topic names UNCHANGED from the source — do NOT rephrase.
9. Do NOT add explanations, descriptions, or commentary.
10. Do NOT add Notes, MCQs, Revision Status, Difficulty Levels, or Mastery Scores.
11. Do NOT add numbering (#001, #002) — the app handles that automatically.
12. Do NOT include unit serial numbers (Unit 1:, Unit 2:, 1., 2., etc.) — the app adds them automatically.
13. Return ONLY the hierarchy — nothing else.

## Indentation Rules

- 1️⃣ has NO leading spaces
- 2️⃣ has 1 leading space
- 3️⃣ has 2 leading spaces
- 4️⃣ has 3 leading spaces

## Example Output

SUBJECT: Anatomy & Physiology

1️⃣ Human Body Systems
 2️⃣ Respiratory System
  3️⃣ Upper Respiratory Tract
   4️⃣ Nose
   4️⃣ Nasal Cavity
   4️⃣ Pharynx
  3️⃣ Lower Respiratory Tract
   4️⃣ Larynx
   4️⃣ Trachea
   4️⃣ Bronchi
   4️⃣ Lungs
 2️⃣ Digestive System
  3️⃣ Alimentary Canal
   4️⃣ Mouth
   4️⃣ Esophagus
   4️⃣ Stomach
  3️⃣ Accessory Organs
   4️⃣ Liver
   4️⃣ Pancreas

1️⃣ Cardiovascular System
 2️⃣ Heart
  3️⃣ Chambers of Heart
  3️⃣ Heart Valves
 2️⃣ Blood Vessels
  3️⃣ Arteries
  3️⃣ Veins

1️⃣ Reproductive System
 2️⃣ Female Reproductive System
  3️⃣ External Genitalia
   4️⃣ Vulva
   4️⃣ Clitoris
   4️⃣ Labia Majora
   4️⃣ Labia Minora
  3️⃣ Internal Genitalia
   4️⃣ Vagina
   4️⃣ Uterus
   4️⃣ Fallopian Tubes
   4️⃣ Ovaries
  3️⃣ Oogenesis

## Important Logic

- Leaf nodes (the deepest level) = what the student actually studies/tracks
- Branch nodes (non-leaf) = organizational folders for grouping
- If the source has: Unit → Topic → Subtopic → stop at 3️⃣
- If the source has: Unit → Topic → Subtopic → Components → use 4️⃣
- Never create empty levels
- Only show levels that actually exist in the source

---

## YOUR TASK

Now convert the following syllabus/content into the format above:

[PASTE YOUR SYLLABUS / TEXTBOOK INDEX / LECTURE LIST HERE]
`;
