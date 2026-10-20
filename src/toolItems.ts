import { JsonFormatterPage, TextDiffPage } from "./tools/general";
import OggConfigPage from "./tools/oggDiff";

export const toolItems = [
  {
    path: '/tools/json-formatter',
    label: 'JSON 格式化',
    description: 'JSON 格式化、压缩与校验',
    component: JsonFormatterPage,
  },
  {
    path: '/tools/text-diff',
    label: '文本对比',
    description: '文本差异与自定义比较规则',
    component: TextDiffPage,
  },
  {
    path: '/tools/ogg-config',
    label: 'OGG 配置表管理',
    description: 'Extract / Replicat 表配置增删与合并',
    component: OggConfigPage,
  },
];