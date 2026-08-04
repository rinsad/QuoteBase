alter table public.unit_catalog
add column if not exists quote_quantity_basis text
check (quote_quantity_basis in ('ton', 'cy', 'load', 'count', 'none'));

alter table public.unit_catalog
add column if not exists quote_quantity_factor numeric(18,8);

update public.unit_catalog
set
  quote_quantity_basis = conversions.quote_quantity_basis,
  quote_quantity_factor = conversions.quote_quantity_factor,
  updated_at = now()
from (
  values
    ('ton', 'ton', 1.00000000),
    ('metric_ton', 'ton', 1.10231131),
    ('lbs', 'ton', 0.00050000),
    ('oz', 'ton', 0.00003125),
    ('kg', 'ton', 0.00110231),
    ('g', 'ton', 0.00000110),
    ('cy', 'cy', 1.00000000),
    ('cubic_foot', 'cy', 0.03703704),
    ('gallon', 'cy', 0.00495113),
    ('liter', 'cy', 0.00130795),
    ('m3', 'cy', 1.30795062),
    ('load', 'load', 1.00000000),
    ('bag', 'count', 1.00000000),
    ('each', 'count', 1.00000000),
    ('sqft', 'none', null::numeric),
    ('acre', 'none', null::numeric),
    ('mile', 'none', null::numeric),
    ('yard', 'none', null::numeric),
    ('foot', 'none', null::numeric),
    ('inch', 'none', null::numeric),
    ('km', 'none', null::numeric),
    ('meter', 'none', null::numeric)
) as conversions(code, quote_quantity_basis, quote_quantity_factor)
where public.unit_catalog.code = conversions.code;

alter table public.unit_catalog
alter column quote_quantity_basis set default 'none';

update public.unit_catalog
set quote_quantity_basis = 'none'
where quote_quantity_basis is null;

alter table public.unit_catalog
alter column quote_quantity_basis set not null;
