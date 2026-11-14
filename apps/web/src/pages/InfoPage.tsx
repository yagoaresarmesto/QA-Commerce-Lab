import { Link, useParams } from 'react-router';
import { Breadcrumbs } from '../components/ui/Commerce';
import { NotFoundPage } from './NotFoundPage';
import { useDocumentTitle } from './useDocumentTitle';

const PAGES: Record<string, { title: string; body: Array<[string, string]> }> = {
  envios: {
    title: 'Envíos y entregas',
    body: [
      ['Envío estándar', 'Entrega a domicilio en 2-4 días laborables por 4,99 €. Gratis en pedidos desde 99 € (importe tras descuentos).'],
      ['Envío exprés 24 h', 'Entrega el siguiente día laborable por 12,99 € para pedidos confirmados antes de las 14:00 (simulado).'],
      ['Recogida en punto de entrega', 'Recoge tu pedido en uno de nuestros puntos de conveniencia en 3-5 días por 1,99 €. Gratis desde 49 €.'],
      ['Zona de envío', 'Solo realizamos envíos a direcciones de España. Todos los plazos y transportistas son ficticios.'],
    ],
  },
  devoluciones: {
    title: 'Devoluciones',
    body: [
      ['Plazo', 'Dispones de 14 días naturales desde la entrega para solicitar la devolución desde “Mis pedidos”.'],
      ['Proceso', 'La solicitud queda “Devolución solicitada” hasta que nuestro equipo la revisa. Al aprobarla, el pedido pasa a “Devuelto” y se reembolsa el importe.'],
      ['Cancelaciones', 'Puedes cancelar un pedido pendiente o pagado mientras no esté en preparación. Si estaba pagado, el reembolso es inmediato (simulado).'],
    ],
  },
  pagos: {
    title: 'Métodos de pago',
    body: [
      ['Tarjeta', 'Pago inmediato mediante un simulador. Solo se aceptan tarjetas de prueba documentadas; nunca introduzcas datos reales.'],
      ['Transferencia bancaria', 'Reservamos los productos durante 72 horas. Si no se recibe la transferencia, el pedido se cancela automáticamente.'],
      ['Seguridad', 'No se almacenan números de tarjeta completos: solo la marca y los 4 últimos dígitos.'],
    ],
  },
  garantia: {
    title: 'Garantía',
    body: [['Garantía de 3 años', 'Todos los productos incluyen 3 años de garantía (ficticia). Los nombres de productos y marcas pertenecen a sus respectivos propietarios y se usan solo con fines ilustrativos: la tienda no tiene relación con ellos y las imágenes son ilustraciones genéricas.']],
  },
  contacto: {
    title: 'Contacto',
    body: [
      ['Atención al cliente', 'Este es un proyecto educativo sin actividad comercial: no existe un servicio de atención real.'],
      ['Email', 'soporte@qacommerce.test (dominio reservado para pruebas, no recibe correo).'],
    ],
  },
  'sobre-nosotros': {
    title: 'Sobre QA Commerce Lab',
    body: [
      ['¿Qué es?', 'Una tienda de electrónica completa y realista creada como System Under Test para practicar automatización de pruebas web y API.'],
      ['Datos ficticios', 'Los productos toman nombres de modelos reales como referencia, pero precios, stock, usuarios, pagos y envíos son simulados. Puedes registrarte y comprar tantas veces como quieras.'],
      ['Para QA Engineers', 'Incluye API REST documentada con OpenAPI, datos deterministas, escenarios preparados y simulación controlada de errores en los entornos de testing.'],
    ],
  },
  terminos: {
    title: 'Términos y condiciones',
    body: [
      ['Uso', 'El sitio se ofrece únicamente con fines de aprendizaje y demostración. No se realizan ventas ni cobros reales.'],
      ['Contenido', 'Los datos pueden restablecerse en cualquier momento. No introduzcas información personal real.'],
    ],
  },
  privacidad: {
    title: 'Privacidad',
    body: [['Datos', 'Utiliza datos inventados. Las cuentas y pedidos de prueba pueden eliminarse periódicamente. Solo se usan cookies técnicas de sesión.']],
  },
};

export function InfoPage() {
  const { slug = '' } = useParams();
  const page = PAGES[slug];
  useDocumentTitle(page?.title);
  if (!page) return <NotFoundPage />;
  return (
    <div className="container-page max-w-3xl py-10 sm:py-14">
      <Breadcrumbs items={[{ label: 'Información' }, { label: page.title }]} />
      <article className="space-y-8" data-testid="info-page">
        <h1 className="text-4xl font-semibold tracking-[-0.035em] sm:text-5xl">{page.title}</h1>
        {page.body.map(([h, p]) => (
          <section key={h}>
            <h2 className="mb-2 text-xl font-semibold tracking-tight">{h}</h2>
            <p className="leading-relaxed text-slate-700">{p}</p>
          </section>
        ))}
        <p className="rounded-3xl bg-slate-50 p-5 text-sm text-slate-500">
          Más información: <Link to="/info/envios" className="font-medium text-slate-950 underline underline-offset-2">envíos</Link> · <Link to="/info/devoluciones" className="font-medium text-slate-950 underline underline-offset-2">devoluciones</Link> · <Link to="/info/pagos" className="font-medium text-slate-950 underline underline-offset-2">pagos</Link>
        </p>
      </article>
    </div>
  );
}
