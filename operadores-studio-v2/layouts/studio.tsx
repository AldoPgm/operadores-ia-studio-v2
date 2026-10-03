"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { ComponentProps } from "react"
import { Compass, Folder } from "lucide-react"

import { StudioPromptBox } from "@/components/studio/studio-prompt-box"
import {
  ExamplePresets,
  TEMPLATES,
  type TemplateItem,
} from "@/components/studio/template-picker"
import { HeroComposition } from "@/components/studio/hero-composition"
import { KeyDialog } from "@/components/studio/key-dialog"
import {
  MyProjects,
  type MyProjectsProject,
} from "@/components/studio/my-projects"
import { StudioSidebar, type StudioView } from "@/components/studio/sidebar"
import { UserGenerations } from "@/components/studio/user-generations"
import type { GalleryItem } from "@/components/studio/gallery/gallery-types"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  estimateGeneration,
  hasPlatformCredentials,
} from "@/generation/actions"
import { MODELS, getModel, parseSettings } from "@/generation/catalog"
import type {
  GenerationPlane,
  MediaItem,
  MediaRole,
  Surface,
} from "@/generation/catalog"
import type { GenerationEstimate } from "@/generation/platform"
import {
  changeImageRole,
  groupMedia,
  inferInputMode,
  inputRoles,
  mergeMedia,
  mergeReferences,
} from "@/generation/catalog/media-inputs"
import { toPlatform } from "@/generation/to-platform"
import { useActive } from "@/generation/stores/active"
import { useSettings } from "@/generation/stores/settings"
import {
  runToGalleryItems,
  runToLibraryItems,
} from "@/lib/studio/gallery-items"
import { useProjects } from "@/lib/studio/projects"
import {
  uploadAsset,
  useUploads,
  type AssetSelection,
} from "@/lib/studio/uploads"
import { useRuns } from "@/lib/studio/use-runs"

/**
 * StudioTemplate — the full creative workspace: projects-first sidebar, hero,
 * the floating prompt dock, Explore / My Projects, and the edge-to-edge
 * generations feed. Generation goes through the model catalog and the
 * platform server actions; history and projects live in the browser.
 *
 * Keep the six structural parts when adapting (see AGENTS.md): sidebar,
 * glow + dot-field atmosphere, HeroComposition, StudioPromptBox, the
 * Explore / My Projects section, and the UserGenerations feed.
 */

const HERO_FALLBACKS = [
  "/presets/city.png",
  "/presets/product.png",
  "/presets/portrait.png",
] as const

const HERO_GLOW =
  "radial-gradient(60% 80% at 50% 0%, rgba(160,164,170,0.14) 0%, rgba(160,164,170,0.05) 42%, transparent 72%)"
const HERO_DOTS = "radial-gradient(rgba(255,255,255,0.2) 1px, transparent 1px)"
const HERO_DOTS_MASK =
  "radial-gradient(55% 70% at 50% 0%, #000 0%, rgba(0,0,0,0.35) 45%, transparent 75%)"

type DockProps = Omit<
  ComponentProps<typeof StudioPromptBox>,
  "className" | "skin"
>

function heroImages(items: GalleryItem[]): readonly [string, string, string] {
  const ready = items
    .filter((i) => i.status === "ready" && i.src !== "")
    .slice(0, 3)
    .map((i) => i.src)
  return [
    ready[0] ?? HERO_FALLBACKS[0],
    ready[1] ?? HERO_FALLBACKS[1],
    ready[2] ?? HERO_FALLBACKS[2],
  ]
}

function HomeState({
  title,
  items,
  projects,
  dock,
  onCreateProject,
  onOpenAll,
  onOpenProject,
  onUseTemplate,
}: {
  title: string
  items: GalleryItem[]
  projects: MyProjectsProject[]
  dock: DockProps
  onCreateProject: (name: string) => void
  onOpenAll: () => void
  onOpenProject: (project: MyProjectsProject) => void
  onUseTemplate: (template: TemplateItem) => void
}) {
  const [tab, setTab] = useState("explore")
  const promptRef = useRef<HTMLDivElement>(null)
  const images = useMemo(() => heroImages(items), [items])

  return (
    <div className="relative flex min-h-0 min-w-0 flex-1 flex-col items-center overflow-x-hidden overflow-y-auto">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[600px]"
        style={{
          backgroundImage: HERO_DOTS,
          backgroundSize: "14px 14px",
          maskImage: HERO_DOTS_MASK,
          WebkitMaskImage: HERO_DOTS_MASK,
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[600px]"
        style={{ backgroundImage: HERO_GLOW }}
      />

      <div className="relative flex w-full flex-col items-center gap-12 px-6 pt-16 pb-16">
        <div
          ref={promptRef}
          className="flex w-full min-w-0 flex-col items-center gap-8"
        >
          <div className="flex w-full min-w-0 flex-col items-center gap-5">
            <HeroComposition
              images={images}
              alt={
                items.some((item) => item.status === "ready")
                  ? "Recent Studio outputs"
                  : "Creative examples"
              }
            />
            <h1 className="w-full max-w-[640px] text-center text-q-accent-lg-bold uppercase">
              {title}
            </h1>
          </div>
          <StudioPromptBox {...dock} />
        </div>

        <div className="flex w-full max-w-[900px] flex-col items-start gap-5">
          <Tabs
            variant="segmented"
            shape="pill"
            value={tab}
            onValueChange={(v) => setTab(String(v))}
          >
            <TabsList>
              <TabsTrigger value="explore" start={<Compass />}>
                Explore
              </TabsTrigger>
              <TabsTrigger value="projects" start={<Folder />}>
                My Projects
              </TabsTrigger>
            </TabsList>
          </Tabs>
          <div key={tab} className="w-full animate-in duration-300 fade-in-0">
            {tab === "projects" ? (
              <MyProjects
                projects={projects}
                generations={items}
                onCreateProject={onCreateProject}
                onOpenAllGenerations={onOpenAll}
                onOpenProject={onOpenProject}
              />
            ) : (
              <ExamplePresets
                items={TEMPLATES}
                onUse={(t) => {
                  onUseTemplate(t)
                  promptRef.current?.scrollIntoView({
                    behavior: "smooth",
                    block: "center",
                  })
                }}
                className="w-full"
              />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function FeedState({
  items,
  previewItems,
  title,
  dock,
  onDelete,
}: {
  items: GalleryItem[]
  previewItems: GalleryItem[]
  title: string
  dock: DockProps
  onDelete: (item: GalleryItem) => void
}) {
  const images = useMemo(() => heroImages(previewItems), [previewItems])
  const dockRef = useRef<HTMLDivElement>(null)
  const [dockHeight, setDockHeight] = useState(180)
  useEffect(() => {
    const node = dockRef.current
    if (!node) return
    const observer = new ResizeObserver(() =>
      setDockHeight(node.getBoundingClientRect().height)
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [])
  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
      <div
        className="flex min-h-0 flex-1 flex-col px-4 pt-4"
        style={{ paddingBottom: dockHeight + 24 }}
      >
        <UserGenerations
          items={items}
          title={title}
          onDelete={onDelete}
          emptyState={{
            images,
            title:
              title === "All Generations"
                ? "No generations yet"
                : `No generations in ${title}`,
            description:
              "Describe an idea below, then generate the first result.",
          }}
        />
      </div>
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center px-4 pt-24 pb-4"
        style={{
          backgroundImage:
            "linear-gradient(to bottom, transparent 0%, var(--background) 100%)",
        }}
      >
        <div ref={dockRef} className="w-full max-w-[900px]">
          <StudioPromptBox
            {...dock}
            skin="glass"
            className="pointer-events-auto w-full"
          />
        </div>
      </div>
    </div>
  )
}

export interface StudioTemplateProps {
  /** Product name in the sidebar header. */
  title?: string
  /** Hero headline above the dock. */
  headline?: string
}

export function StudioTemplate({
  title = "Operadores IA",
  headline = "Creá con Operadores IA",
}: StudioTemplateProps) {
  const [view, setView] = useState<StudioView>({ kind: "home" })
  const [collapsed, setCollapsed] = useState(true)
  const [isMobile, setIsMobile] = useState(false)
  const [prompt, setPrompt] = useState("")
  const [media, setMedia] = useState<MediaItem[]>([])
  const [keyOpen, setKeyOpen] = useState(false)
  const [keyConfigured, setKeyConfigured] = useState(false)
  const [keyRevision, setKeyRevision] = useState(0)
  const [estimateResult, setEstimateResult] = useState<{
    for: GenerationPlane
    keyRevision: number
    estimate: GenerationEstimate | null
    error: string | null
  } | null>(null)
  const [canceling, setCanceling] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)

  const surface = useActive((s) => s.surface)
  const modelId = useActive((s) => s.model)
  const setActiveModel = useActive((s) => s.setModel)
  const settingsByModel = useSettings((s) => s.byModel)
  const setSetting = useSettings((s) => s.set)
  const projectsStore = useProjects()
  const uploads = useUploads((s) => s.items)
  const runs = useRuns()

  useEffect(() => {
    void Promise.all([
      useActive.persist.rehydrate(),
      useSettings.persist.rehydrate(),
      useProjects.persist.rehydrate(),
      useUploads.persist.rehydrate(),
    ])
  }, [])

  const surfaces = useMemo(
    () =>
      (["video", "image"] as Surface[]).filter((s) =>
        MODELS.some((m) => m.surface === s)
      ),
    []
  )
  const models = useMemo(
    () => MODELS.filter((m) => m.surface === surface),
    [surface]
  )
  const model = useMemo(() => {
    try {
      return getModel(modelId)
    } catch {
      return models[0] ?? MODELS[0]!
    }
  }, [modelId, models])
  const settings = useMemo(
    () => settingsByModel[model.id] ?? {},
    [settingsByModel, model.id]
  )
  const inputMode = inferInputMode(model, media)
  const prepared = useMemo(() => {
    try {
      const plane: GenerationPlane = {
        model: model.id,
        inputMode,
        prompt: { text: prompt.trim() },
        media: groupMedia(media),
        settings: parseSettings(model, settings),
      }
      toPlatform(plane)
      return { plane, error: null }
    } catch (caught) {
      return {
        plane: null,
        error: caught instanceof Error ? caught.message : String(caught),
      }
    }
  }, [inputMode, media, model, prompt, settings])

  useEffect(() => {
    if (!keyConfigured || !prepared.plane) return
    const plane = prepared.plane
    let active = true
    const timer = window.setTimeout(() => {
      void estimateGeneration(plane)
        .then((estimate) => {
          if (active)
            setEstimateResult({
              for: plane,
              keyRevision,
              estimate,
              error: null,
            })
        })
        .catch((caught: unknown) => {
          if (active)
            setEstimateResult({
              for: plane,
              keyRevision,
              estimate: null,
              error:
                caught instanceof Error
                  ? caught.message
                  : "Error de Higgsfield.",
            })
        })
    }, 700)
    return () => {
      active = false
      window.clearTimeout(timer)
    }
  }, [keyConfigured, keyRevision, prepared.plane])

  useEffect(() => {
    void hasPlatformCredentials().then(setKeyConfigured)
  }, [])

  useEffect(() => {
    const url = new URL(window.location.href)
    if (url.searchParams.get("connect-key") !== "1") return
    url.searchParams.delete("connect-key")
    window.history.replaceState(null, "", url)
    queueMicrotask(() => setKeyOpen(true))
  }, [])

  useEffect(() => {
    const query = window.matchMedia("(max-width: 640px)")
    const sync = () => {
      setIsMobile(query.matches)
      setCollapsed(query.matches)
    }
    sync()
    query.addEventListener("change", sync)
    return () => query.removeEventListener("change", sync)
  }, [])

  const galleryItems = useMemo(
    () => runs.records.flatMap(runToGalleryItems),
    [runs.records]
  )
  const libraryItems = useMemo(
    () => [...uploads, ...runs.records.flatMap(runToLibraryItems)],
    [runs.records, uploads]
  )
  const byProject = useMemo(() => {
    const map = new Map<string, GalleryItem[]>()
    for (const item of galleryItems) {
      if (!item.projectId) continue
      map.set(item.projectId, [...(map.get(item.projectId) ?? []), item])
    }
    return map
  }, [galleryItems])
  const projects = useMemo<MyProjectsProject[]>(
    () =>
      projectsStore.projects.map((p) => {
        const items = byProject.get(p.id) ?? []
        const cover = items.find(
          (i) => i.status === "ready" && i.src !== ""
        )?.src
        return {
          id: p.id,
          name: p.name,
          generationCount: new Set(items.map((i) => i.runId)).size,
          updatedAt: p.updatedAt,
          ...(cover ? { cover } : {}),
        }
      }),
    [byProject, projectsStore.projects]
  )
  const selectedProject =
    view.kind === "project"
      ? projects.find((p) => p.id === view.projectId)
      : undefined
  const visibleItems =
    view.kind === "project"
      ? (byProject.get(view.projectId) ?? [])
      : galleryItems

  const generating = runs.running.length > 0
  const canGenerate =
    !runs.submitting &&
    prepared.plane !== null &&
    (prompt.trim().length > 0 || media.length > 0)
  const missingRequiredInput =
    model.requiredRoles?.some(
      (role) => !media.some((item) => item.role === role)
    ) ||
    (model.requirePrompt && !prompt.trim())

  const currentEstimate =
    estimateResult?.for === prepared.plane &&
    estimateResult.keyRevision === keyRevision
      ? estimateResult
      : null

  const handleGenerate = useCallback(() => {
    if (!canGenerate || generating || !prepared.plane) return
    setLocalError(null)
    if (!keyConfigured) {
      setKeyOpen(true)
      return
    }
    if (
      !currentEstimate ||
      (!currentEstimate.estimate && !currentEstimate.error)
    )
      return
    const projectId = view.kind === "project" ? view.projectId : undefined
    void runs.submit(prepared.plane, projectId).then((record) => {
      if (record && view.kind === "home") setView({ kind: "all" })
      if (record && projectId) projectsStore.touch(projectId)
    })
  }, [
    canGenerate,
    generating,
    keyConfigured,
    currentEstimate,
    prepared.plane,
    projectsStore,
    runs,
    view,
  ])

  const handleCancel = useCallback(() => {
    if (!generating || canceling) return
    setCanceling(true)
    void Promise.all(runs.running.map((r) => runs.cancel(r.id))).finally(() =>
      setCanceling(false)
    )
  }, [canceling, generating, runs])

  const handleUseTemplate = (t: TemplateItem) => {
    setPrompt(t.prompt)
    if (t.modelId && MODELS.some((m) => m.id === t.modelId)) {
      const target = getModel(t.modelId)
      setActiveModel(target.id)
      if (t.settings) setSetting(target.id, t.settings)
    } else if (t.kind !== surface && surfaces.includes(t.kind)) {
      changeSurface(t.kind)
    }
  }

  // setModel derives the surface from the model, so switching surface = picking its first model.
  const changeSurface = (next: Surface) => {
    const first = MODELS.find((m) => m.surface === next)
    if (first) setActiveModel(first.id)
  }

  const dock: DockProps = {
    surfaces,
    surface,
    onSurfaceChange: changeSurface,
    models,
    model,
    onModelChange: (id) => {
      setLocalError(null)
      setActiveModel(id)
    },
    settings,
    onSettingChange: (key, value) => setSetting(model.id, { [key]: value }),
    inputMode,
    media,
    onMediaAdd: (role: MediaRole | "auto", selection: AssetSelection[]) => {
      const selected = selection.map((item) => ({
        id: item.id,
        url: item.src,
        kind: item.kind,
        name: item.name,
      }))
      const roles = inputRoles(model, inputMode)
      const next =
        role === "auto"
          ? mergeReferences(media, selected, roles)
          : mergeMedia(
              media,
              role,
              selected.map((item) => ({ ...item, role })),
              roles[role] ?? 0
            )
      setLocalError(null)
      setMedia(next)
    },
    onMediaRemove: (id) => {
      setLocalError(null)
      setMedia((current) => current.filter((item) => item.id !== id))
    },
    onMediaRoleChange: (id, role) => {
      try {
        setMedia(changeImageRole(model, media, id, role))
        setLocalError(null)
      } catch (caught) {
        setLocalError(
          caught instanceof Error
            ? caught.message
            : "Could not change the image role."
        )
      }
    },
    library: { items: libraryItems, onUpload: uploadAsset },
    prompt,
    onPromptChange: setPrompt,
    onGenerate: handleGenerate,
    onCancel: handleCancel,
    cost: !canGenerate
      ? undefined
      : !keyConfigured
        ? "API key"
        : currentEstimate?.estimate
          ? `USD $${currentEstimate.estimate.usd}`
          : currentEstimate?.error
            ? "Precio N/D"
            : "Cotizando…",
    generating,
    canceling,
    generateDisabled: !canGenerate || (keyConfigured && !currentEstimate),
    disabledReason: runs.submitting
      ? "Submitting to Higgsfield..."
      : (currentEstimate?.error ?? prepared.error ?? undefined),
    error:
      localError ??
      runs.error ??
      (keyConfigured && canGenerate && currentEstimate?.error
        ? "Precio no disponible."
        : null) ??
      (!missingRequiredInput && media.length > 0 ? prepared.error : null) ??
      undefined,
  }

  return (
    <div className="flex h-dvh overflow-hidden bg-background">
      <StudioSidebar
        title={title}
        view={view}
        onViewChange={(next) => {
          setView(next)
          if (isMobile) setCollapsed(true)
        }}
        projects={projects}
        onCreateProject={(name) =>
          setView({ kind: "project", projectId: projectsStore.create(name).id })
        }
        onRenameProject={(id, name) => projectsStore.rename(id, name)}
        onDeleteProject={(id) => {
          projectsStore.remove(id)
          if (view.kind === "project" && view.projectId === id)
            setView({ kind: "all" })
        }}
        collapsed={collapsed}
        isMobile={isMobile}
        onCollapsedChange={setCollapsed}
        keyConfigured={keyConfigured}
        onOpenKey={() => setKeyOpen(true)}
      />
      <main className="relative flex min-w-0 flex-1 flex-col">
        {view.kind === "home" ? (
          <HomeState
            title={headline}
            items={galleryItems}
            projects={projects}
            dock={dock}
            onCreateProject={(name) =>
              setView({
                kind: "project",
                projectId: projectsStore.create(name).id,
              })
            }
            onOpenAll={() => setView({ kind: "all" })}
            onOpenProject={(p) => setView({ kind: "project", projectId: p.id })}
            onUseTemplate={handleUseTemplate}
          />
        ) : (
          <FeedState
            items={visibleItems}
            previewItems={galleryItems}
            title={selectedProject?.name ?? "All Generations"}
            dock={dock}
            onDelete={(item) => runs.remove(item.runId)}
          />
        )}
      </main>
      <KeyDialog
        open={keyOpen}
        onOpenChange={setKeyOpen}
        configured={keyConfigured}
        onChange={(configured) => {
          setKeyConfigured(configured)
          setKeyRevision((revision) => revision + 1)
        }}
      />
    </div>
  )
}
