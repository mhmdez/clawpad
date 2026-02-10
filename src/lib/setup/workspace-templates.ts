import fs from 'fs/promises';
import path from 'path';
import { createSpace, writePage } from '@/lib/files';
import { getPagesDir } from '@/lib/files/paths';

export type WorkspaceUseCase =
  | 'engineering-devops'
  | 'research-academia'
  | 'business-consulting'
  | 'creative-writing'
  | 'personal-knowledge'
  | 'other';

export interface WorkspaceUseCaseOption {
  id: WorkspaceUseCase;
  label: string;
  icon: string;
  description: string;
}

interface SpaceTemplate {
  name: string;
  displayName: string;
  icon: string;
  color: string;
  sort?: 'date-desc' | 'date-asc' | 'alpha' | 'manual';
}

interface WorkspaceTemplate {
  id: WorkspaceUseCase;
  label: string;
  spaces: SpaceTemplate[];
  welcomePath: string;
  welcomeTitle: string;
  welcomeIcon: string;
  welcomeBody: string;
}

export interface ScaffoldResult {
  spaces: Array<{ name: string; status: 'created' | 'exists' | 'error'; error?: string }>;
  pages: Array<{ path: string; status: 'created' | 'exists' | 'error'; error?: string }>;
}

export const WELCOME_TO_CLAWPAD_PAGE_PATH = 'welcome-to-clawpad.md';

export const WORKSPACE_USE_CASE_OPTIONS: WorkspaceUseCaseOption[] = [
  {
    id: 'engineering-devops',
    label: 'Engineering & DevOps',
    icon: '🏗️',
    description: 'Infrastructure, runbooks, architecture, and delivery workflows.',
  },
  {
    id: 'research-academia',
    label: 'Research & Academia',
    icon: '🔬',
    description: 'Projects, literature reviews, experiments, and writing drafts.',
  },
  {
    id: 'business-consulting',
    label: 'Business & Consulting',
    icon: '🏢',
    description: 'Clients, strategy, meetings, and engagement tracking.',
  },
  {
    id: 'creative-writing',
    label: 'Creative & Writing',
    icon: '✍️',
    description: 'Drafts, research, world-building, and idea capture.',
  },
  {
    id: 'personal-knowledge',
    label: 'Personal Knowledge (PARA)',
    icon: '📝',
    description: 'Projects, areas, resources, and archives.',
  },
  {
    id: 'other',
    label: 'Other',
    icon: '✨',
    description: 'A general structure you can customize with your agent.',
  },
];

const TEMPLATE_MAP: Record<WorkspaceUseCase, WorkspaceTemplate> = {
  'engineering-devops': {
    id: 'engineering-devops',
    label: 'Engineering & DevOps',
    spaces: [
      { name: 'infrastructure', displayName: 'Infrastructure', icon: '🏗️', color: '#3B82F6', sort: 'alpha' },
      { name: 'devops', displayName: 'DevOps', icon: '🔧', color: '#10B981', sort: 'alpha' },
      { name: 'architecture', displayName: 'Architecture', icon: '📐', color: '#8B5CF6', sort: 'alpha' },
      { name: 'security', displayName: 'Security', icon: '🔒', color: '#EF4444', sort: 'alpha' },
      { name: 'team', displayName: 'Team', icon: '👥', color: '#F59E0B', sort: 'alpha' },
      { name: 'daily-notes', displayName: 'Daily Notes', icon: '📝', color: '#6B7280', sort: 'date-desc' },
    ],
    welcomePath: 'infrastructure/welcome.md',
    welcomeTitle: 'Welcome to Your Engineering Workspace',
    welcomeIcon: '👋',
    welcomeBody: `# Welcome to Your Engineering Workspace

Use this workspace for infra docs, delivery operations, architecture decisions, and team runbooks.

## Spaces

- **Infrastructure**: Cloud resources, optimization, migration plans
- **DevOps**: CI/CD pipelines, release workflows, automation
- **Architecture**: ADRs, diagrams, technical roadmaps
- **Security**: Audits, controls, access reviews
- **Team**: Process docs and templates
- **Daily Notes**: Logs and standups
`,
  },
  'research-academia': {
    id: 'research-academia',
    label: 'Research & Academia',
    spaces: [
      { name: 'projects', displayName: 'Projects', icon: '🔬', color: '#8B5CF6', sort: 'alpha' },
      { name: 'literature', displayName: 'Literature', icon: '📚', color: '#3B82F6', sort: 'alpha' },
      { name: 'experiments', displayName: 'Experiments', icon: '🧪', color: '#10B981', sort: 'date-desc' },
      { name: 'writing', displayName: 'Writing', icon: '✍️', color: '#F59E0B', sort: 'alpha' },
      { name: 'notes', displayName: 'Notes', icon: '📝', color: '#6B7280', sort: 'date-desc' },
    ],
    welcomePath: 'projects/welcome.md',
    welcomeTitle: 'Welcome to Your Research Workspace',
    welcomeIcon: '👋',
    welcomeBody: `# Welcome to Your Research Workspace

Track your active studies, evidence, and outputs in one place.

## Spaces

- **Projects**: Active research efforts
- **Literature**: Paper notes and citations
- **Experiments**: Logs, runs, and outcomes
- **Writing**: Drafts and manuscripts
- **Notes**: Meetings and scratch notes
`,
  },
  'business-consulting': {
    id: 'business-consulting',
    label: 'Business & Consulting',
    spaces: [
      { name: 'clients', displayName: 'Clients', icon: '🏢', color: '#3B82F6', sort: 'alpha' },
      { name: 'projects', displayName: 'Projects', icon: '📊', color: '#10B981', sort: 'alpha' },
      { name: 'meetings', displayName: 'Meetings', icon: '📅', color: '#F59E0B', sort: 'date-desc' },
      { name: 'strategy', displayName: 'Strategy', icon: '🎯', color: '#8B5CF6', sort: 'alpha' },
      { name: 'templates', displayName: 'Templates', icon: '📋', color: '#6B7280', sort: 'alpha' },
      { name: 'daily-notes', displayName: 'Daily Notes', icon: '📝', color: '#6B7280', sort: 'date-desc' },
    ],
    welcomePath: 'clients/welcome.md',
    welcomeTitle: 'Welcome to Your Business Workspace',
    welcomeIcon: '👋',
    welcomeBody: `# Welcome to Your Business Workspace

Organize delivery work by clients, projects, and strategic initiatives.

## Spaces

- **Clients**: Client-specific docs and context
- **Projects**: Active engagements and deliverables
- **Meetings**: Agendas and meeting notes
- **Strategy**: Planning and positioning docs
- **Templates**: Reusable frameworks and docs
- **Daily Notes**: Daily activity log
`,
  },
  'creative-writing': {
    id: 'creative-writing',
    label: 'Creative & Writing',
    spaces: [
      { name: 'projects', displayName: 'Projects', icon: '📖', color: '#8B5CF6', sort: 'alpha' },
      { name: 'drafts', displayName: 'Drafts', icon: '✏️', color: '#F59E0B', sort: 'date-desc' },
      { name: 'research', displayName: 'Research', icon: '🔍', color: '#3B82F6', sort: 'alpha' },
      { name: 'world-building', displayName: 'World Building', icon: '🌍', color: '#10B981', sort: 'alpha' },
      { name: 'ideas', displayName: 'Ideas', icon: '💡', color: '#EC4899', sort: 'date-desc' },
      { name: 'daily-notes', displayName: 'Daily Notes', icon: '📝', color: '#6B7280', sort: 'date-desc' },
    ],
    welcomePath: 'projects/welcome.md',
    welcomeTitle: 'Welcome to Your Creative Workspace',
    welcomeIcon: '👋',
    welcomeBody: `# Welcome to Your Creative Workspace

Capture ideas, build stories, and keep drafting momentum.

## Spaces

- **Projects**: Active writing projects
- **Drafts**: Work in progress
- **Research**: References and source material
- **World Building**: Characters, lore, and settings
- **Ideas**: Prompts and sparks
- **Daily Notes**: Creative journal
`,
  },
  'personal-knowledge': {
    id: 'personal-knowledge',
    label: 'Personal Knowledge (PARA)',
    spaces: [
      { name: 'projects', displayName: 'Projects', icon: '🎯', color: '#10B981', sort: 'alpha' },
      { name: 'areas', displayName: 'Areas', icon: '🏠', color: '#3B82F6', sort: 'alpha' },
      { name: 'resources', displayName: 'Resources', icon: '📚', color: '#8B5CF6', sort: 'alpha' },
      { name: 'archive', displayName: 'Archive', icon: '📦', color: '#6B7280', sort: 'date-desc' },
      { name: 'daily-notes', displayName: 'Daily Notes', icon: '📝', color: '#F59E0B', sort: 'date-desc' },
    ],
    welcomePath: 'projects/welcome.md',
    welcomeTitle: 'Welcome to Your PARA Workspace',
    welcomeIcon: '👋',
    welcomeBody: `# Welcome to Your PARA Workspace

Use PARA to organize work by urgency and reference value.

## Spaces

- **Projects**: Active outcomes with deadlines
- **Areas**: Ongoing responsibilities
- **Resources**: Topic-based reference material
- **Archive**: Inactive and completed items
- **Daily Notes**: Daily capture and reflection
`,
  },
  other: {
    id: 'other',
    label: 'Other',
    spaces: [
      { name: 'projects', displayName: 'Projects', icon: '📁', color: '#10B981', sort: 'alpha' },
      { name: 'notes', displayName: 'Notes', icon: '📝', color: '#3B82F6', sort: 'date-desc' },
      { name: 'resources', displayName: 'Resources', icon: '📚', color: '#8B5CF6', sort: 'alpha' },
      { name: 'daily-notes', displayName: 'Daily Notes', icon: '🗒️', color: '#6B7280', sort: 'date-desc' },
    ],
    welcomePath: 'projects/welcome.md',
    welcomeTitle: 'Welcome to Your Workspace',
    welcomeIcon: '👋',
    welcomeBody: `# Welcome to Your Workspace

This is a flexible starter structure you can adapt with your OpenClaw agent.

## Spaces

- **Projects**: Active work
- **Notes**: Fast capture
- **Resources**: References and links
- **Daily Notes**: Ongoing log
`,
  },
};

export function isWorkspaceUseCase(value: string): value is WorkspaceUseCase {
  return value in TEMPLATE_MAP;
}

export function getWorkspaceUseCaseLabel(value: WorkspaceUseCase): string {
  return TEMPLATE_MAP[value].label;
}

export function getWorkspaceTemplate(
  useCase: WorkspaceUseCase,
  customUseCase?: string,
): WorkspaceTemplate {
  if (useCase !== 'other') {
    return TEMPLATE_MAP[useCase];
  }

  const trimmed = customUseCase?.trim();
  if (!trimmed) {
    return TEMPLATE_MAP.other;
  }

  return {
    ...TEMPLATE_MAP.other,
    welcomeBody: `${TEMPLATE_MAP.other.welcomeBody}\nCustom context: ${trimmed}\n`,
  };
}

export async function scaffoldWorkspaceTemplate(
  useCase: WorkspaceUseCase,
  customUseCase?: string,
): Promise<ScaffoldResult> {
  const template = getWorkspaceTemplate(useCase, customUseCase);
  const result: ScaffoldResult = {
    spaces: [],
    pages: [],
  };

  for (const space of template.spaces) {
    try {
      await createSpace(space.name, {
        name: space.displayName,
        icon: space.icon,
        color: space.color,
        sort: space.sort,
      });
      result.spaces.push({ name: space.name, status: 'created' });
    } catch (err) {
      const message = (err as Error).message;
      if (message.includes('already exists') || message.includes('EEXIST')) {
        result.spaces.push({ name: space.name, status: 'exists' });
      } else {
        result.spaces.push({ name: space.name, status: 'error', error: message });
      }
    }
  }

  const welcomeAbsolutePath = path.join(getPagesDir(), template.welcomePath);
  try {
    await fs.access(welcomeAbsolutePath);
    result.pages.push({ path: template.welcomePath, status: 'exists' });
  } catch {
    try {
      const now = new Date().toISOString();
      await writePage(template.welcomePath, `\n${template.welcomeBody}`, {
        title: template.welcomeTitle,
        icon: template.welcomeIcon,
        created: now,
        modified: now,
      });
      result.pages.push({ path: template.welcomePath, status: 'created' });
    } catch (err) {
      result.pages.push({
        path: template.welcomePath,
        status: 'error',
        error: (err as Error).message,
      });
    }
  }

  return result;
}

export async function ensureWelcomeToClawPadPage(): Promise<{
  path: string;
  status: 'created' | 'exists' | 'error';
  error?: string;
}> {
  const pagePath = WELCOME_TO_CLAWPAD_PAGE_PATH;
  const pageAbsolutePath = path.join(getPagesDir(), pagePath);

  try {
    await fs.access(pageAbsolutePath);
    return { path: pagePath, status: 'exists' };
  } catch {
    try {
      const now = new Date().toISOString();
      await writePage(
        pagePath,
        `
# Welcome to ClawPad

Your workspace is ready.

## Start here

- Open the sidebar to browse spaces and pages
- Press \`Cmd+N\` to create a new page
- Press \`Cmd+K\` to search everything
- Use chat to ask OpenClaw to create plans, docs, or runbooks
`,
        {
          title: 'Welcome to ClawPad',
          icon: '👋',
          created: now,
          modified: now,
        },
      );
      return { path: pagePath, status: 'created' };
    } catch (err) {
      return {
        path: pagePath,
        status: 'error',
        error: (err as Error).message,
      };
    }
  }
}
