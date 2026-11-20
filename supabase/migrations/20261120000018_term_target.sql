-- 0018: a target GPA per semester (default 4.00). The Academics page tracks progress toward it.
alter table public.academic_terms
  add column target_gpa numeric(3, 2) not null default 4.00 check (target_gpa between 0 and 4);

grant insert (target_gpa), update (target_gpa) on public.academic_terms to authenticated;
