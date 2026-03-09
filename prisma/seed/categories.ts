export const categoryColors = [
  '#EF4444', '#F97316', '#F59E0B', '#EAB308', '#84CC16',
  '#22C55E', '#10B981', '#14B8A6', '#06B6D4', '#0EA5E9',
  '#3B82F6', '#6366F1', '#8B5CF6', '#A855F7', '#D946EF',
  '#EC4899', '#F43F5E',
]

export const defaultCategories = [
  {
    title: 'Alimentação',
    description: 'Compras de alimentos e refeições',
    icon: 'utensils',
    color: '#22C55E',
    children: [
      { title: 'Supermercado', description: 'Compras de alimentos e produtos de higiene', icon: 'shopping-cart', color: '#22C55E' },
      { title: 'Restaurante', description: 'Refeições em restaurantes e lanchonetes', icon: 'utensils-crossed', color: '#22C55E' },
      { title: 'Delivery', description: 'Pedidos de comida delivery', icon: 'package', color: '#22C55E' },
      { title: 'Padaria', description: 'Pães, bolos e confeitaria', icon: 'croissant', color: '#EAB308' },
      { title: 'Feira', description: 'Frutas, verduras e legumes', icon: 'apple', color: '#84CC16' },
      { title: 'Açougue', description: 'Carnes e frios', icon: 'beef', color: '#EF4444' },
    ]
  },
  {
    title: 'Transporte',
    description: 'Deslocamento e veículos',
    icon: 'car',
    color: '#3B82F6',
    children: [
      { title: 'Posto de Gasolina', description: 'Combustível para veículos', icon: 'fuel', color: '#F59E0B' },
      { title: 'Transporte Público', description: 'Ônibus, metrô e bilhetes', icon: 'bus', color: '#3B82F6' },
      { title: 'Uber/99', description: 'Transporte por aplicativo', icon: 'car', color: '#6366F1' },
      { title: 'Manutenção Veicular', description: 'Oficina, troca de óleo e reparos', icon: 'wrench', color: '#64748B' },
      { title: 'IPVA e Licenciamento', description: 'Impostos e documentação do veículo', icon: 'file-text', color: '#475569' },
      { title: 'Estacionamento', description: 'Taxas de estacionamento', icon: 'parking-circle', color: '#94A3B8' },
    ]
  },
  {
    title: 'Moradia',
    description: 'Contas da casa',
    icon: 'home',
    color: '#8B5CF6',
    children: [
      { title: 'Aluguel', description: 'Pagamento de aluguel', icon: 'building', color: '#8B5CF6' },
      { title: 'Condomínio', description: 'Taxa condominial', icon: 'building-2', color: '#7C3AED' },
      { title: 'Conta de Luz', description: 'Energia elétrica', icon: 'zap', color: '#F59E0B' },
      { title: 'Conta de Água', description: 'Abastecimento de água', icon: 'droplets', color: '#0EA5E9' },
      { title: 'Gás', description: 'Gás de cozinha', icon: 'flame', color: '#F97316' },
    ]
  },
  {
    title: 'Telecomunicações',
    description: 'Internet, telefone e streaming',
    icon: 'wifi',
    color: '#06B6D4',
    children: [
      { title: 'Internet', description: 'Provedor de internet', icon: 'wifi', color: '#06B6D4' },
      { title: 'Telefone/Celular', description: 'Plano de telefonia', icon: 'smartphone', color: '#0EA5E9' },
      { title: 'Streaming', description: 'Netflix, Spotify e assinaturas', icon: 'tv', color: '#EC4899' },
    ]
  },
  {
    title: 'Saúde',
    description: 'Cuidados com a saúde',
    icon: 'heart-pulse',
    color: '#EF4444',
    children: [
      { title: 'Farmácia', description: 'Medicamentos e produtos de saúde', icon: 'pill', color: '#EF4444' },
      { title: 'Plano de Saúde', description: 'Convênio médico', icon: 'shield-heart', color: '#F43F5E' },
      { title: 'Consultas Médicas', description: 'Médicos particulares', icon: 'stethoscope', color: '#E11D48' },
      { title: 'Dentista', description: 'Tratamentos odontológicos', icon: 'smile', color: '#14B8A6' },
      { title: 'Academia', description: 'Mensalidade de academia', icon: 'dumbbell', color: '#10B981' },
    ]
  },
  {
    title: 'Educação',
    description: 'Estudos e aprendizado',
    icon: 'graduation-cap',
    color: '#6366F1',
    children: [
      { title: 'Educação', description: 'Cursos e faculdade', icon: 'graduation-cap', color: '#6366F1' },
      { title: 'Livros', description: 'Compras de livros', icon: 'book-open', color: '#8B5CF6' },
      { title: 'Material Escolar', description: 'Cadernos, canetas e material', icon: 'pencil', color: '#A855F7' },
    ]
  },
  {
    title: 'Lazer',
    description: 'Entretenimento e viagens',
    icon: 'palette',
    color: '#EC4899',
    children: [
      { title: 'Cinema', description: 'Ingressos de cinema', icon: 'film', color: '#EC4899' },
      { title: 'Shows e Eventos', description: 'Ingressos de shows e festivais', icon: 'music', color: '#D946EF' },
      { title: 'Viagens', description: 'Hospedagem e passagens', icon: 'plane', color: '#0EA5E9' },
      { title: 'Hotel', description: 'Hospedagem em hotéis', icon: 'bed-double', color: '#06B6D4' },
    ]
  },
  {
    title: 'Compras',
    description: 'Compras gerais',
    icon: 'shopping-bag',
    color: '#F97316',
    children: [
      { title: 'Roupas', description: 'Vestuário e calçados', icon: 'shirt', color: '#F97316' },
      { title: 'Eletrônicos', description: 'Celulares, computadores e gadgets', icon: 'smartphone', color: '#64748B' },
      { title: 'Móveis', description: 'Móveis e decoração', icon: 'sofa', color: '#A16207' },
      { title: 'Eletrodomésticos', description: 'Geladeira, fogão e eletrodomésticos', icon: 'refrigerator', color: '#78716C' },
      { title: 'Presentes', description: 'Presentes e lembranças', icon: 'gift', color: '#F43F5E' },
    ]
  },
  {
    title: 'Beleza',
    description: 'Cuidados pessoais',
    icon: 'sparkles',
    color: '#D946EF',
    children: [
      { title: 'Beleza', description: 'Salão, cosméticos e cuidados pessoais', icon: 'sparkles', color: '#D946EF' },
      { title: 'Barbearia', description: 'Corte de cabelo e barba', icon: 'scissors', color: '#A855F7' },
    ]
  },
  {
    title: 'Pets',
    description: 'Animais de estimação',
    icon: 'paw-print',
    color: '#F59E0B',
    children: [
      { title: 'Pet Shop', description: 'Produtos e serviços para pets', icon: 'store', color: '#F59E0B' },
      { title: 'Veterinário', description: 'Consultas e tratamentos para animais', icon: 'stethoscope', color: '#D97706' },
      { title: 'Ração', description: 'Alimentação para pets', icon: 'bowl-food', color: '#B45309' },
    ]
  },
  {
    title: 'Serviços',
    description: 'Serviços profissionais',
    icon: 'briefcase',
    color: '#64748B',
    children: [
      { title: 'Seguro', description: 'Apólice de seguros', icon: 'shield', color: '#64748B' },
      { title: 'Impostos', description: 'IR, IPTU e outros tributos', icon: 'receipt', color: '#475569' },
      { title: 'Contador', description: 'Honorários contábeis', icon: 'calculator', color: '#334155' },
      { title: 'Advogado', description: 'Honorários advocatícios', icon: 'scale', color: '#1E293B' },
    ]
  },
  {
    title: 'Financeiro',
    description: 'Receitas e despesas financeiras',
    icon: 'wallet',
    color: '#10B981',
    children: [
      { title: 'Doações', description: 'Doações e caridade', icon: 'heart', color: '#EF4444' },
      { title: 'Dízimo', description: 'Contribuições religiosas', icon: 'church', color: '#8B5CF6' },
      { title: 'Investimentos', description: 'Aplicações financeiras', icon: 'trending-up', color: '#10B981' },
      { title: 'Poupança', description: 'Reserva e economia', icon: 'piggy-bank', color: '#14B8A6' },
      { title: 'Salário', description: 'Renda do trabalho', icon: 'banknote', color: '#22C55E' },
      { title: 'Freelance', description: 'Renda de trabalhos avulsos', icon: 'laptop', color: '#06B6D4' },
      { title: 'Aluguel Recebido', description: 'Renda de imóveis alugados', icon: 'building', color: '#0EA5E9' },
      { title: 'Dividendos', description: 'Rendimentos de investimentos', icon: 'coins', color: '#EAB308' },
      { title: 'Reembolso', description: 'Valores devolvidos', icon: 'rotate-ccw', color: '#84CC16' },
      { title: 'Empréstimo Recebido', description: 'Dinheiro emprestado recebido', icon: 'arrow-down-circle', color: '#22C55E' },
      { title: 'Empréstimo Pago', description: 'Pagamento de empréstimos', icon: 'arrow-up-circle', color: '#EF4444' },
      { title: 'Cartão de Crédito', description: 'Fatura do cartão', icon: 'credit-card', color: '#F97316' },
      { title: 'Financiamento', description: 'Parcelas de financiamento', icon: 'file-spreadsheet', color: '#F59E0B' },
    ]
  },
  {
    title: 'Outros',
    description: 'Outras despesas ou receitas',
    icon: 'more-horizontal',
    color: '#94A3B8',
    children: []
  },
]
