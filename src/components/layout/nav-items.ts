import {
  FolderOpen,
  FileText,
  Images,
  Film,
  Globe,
  UploadCloud,
  Star,
  Trash2,
  Plug,
  Settings,
  LayoutDashboard,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  description: string;
  /** Item exibido com contador de uploads em andamento. */
  badge?: "uploads";
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, description: "Visao geral do acervo" },
  { href: "/biblioteca", label: "Biblioteca completa", icon: FolderOpen, description: "Todos os arquivos" },
  { href: "/documentos", label: "Documentos e textos", icon: FileText, description: "PDF, DOCX, TXT, MD e RTF" },
  { href: "/imagens", label: "Imagens e albuns", icon: Images, description: "Fotos e organizacao" },
  { href: "/videos", label: "Videos", icon: Film, description: "Arquivos de video" },
  { href: "/salvar", label: "Salvar conteudo", icon: Globe, description: "Descobrir e importar midias" },
  { href: "/uploads", label: "Uploads em andamento", icon: UploadCloud, description: "Acompanhar envios", badge: "uploads" },
  { href: "/favoritos", label: "Favoritos", icon: Star, description: "Seus arquivos marcados" },
  { href: "/lixeira", label: "Lixeira", icon: Trash2, description: "Arquivos excluidos" },
  { href: "/integracoes", label: "Integracoes", icon: Plug, description: "Servicos externos" },
  { href: "/configuracoes", label: "Configuracoes", icon: Settings, description: "Conta e preferencias" },
];

export const APP_NAME = "Acervo Digital";
