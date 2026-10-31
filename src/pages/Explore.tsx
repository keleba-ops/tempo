import { useEffect, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Loader2, Search, SlidersHorizontal, Sparkles, X } from 'lucide-react';
import type { BusinessSummary } from '../../shared/types';
import { get } from '../lib/api';
import { BusinessCard } from '../components/BusinessCard';
import { SkeletonCard } from '../components/Loading';
import { EmptyState } from '../components/EmptyState';
import { CategoryIcon } from '../components/CategoryIcon';

interface Category {
  name: string;
  count: number;
}

export function Explore() {
  const [searchParams, setSearchParams] = useSearchParams();
  const q = searchParams.get('q') || '';
  const category = searchParams.get('category') || 'All';
  const [input, setInput] = useState(q);
  const [businesses, setBusinesses] = useState<BusinessSummary[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => setInput(q), [q]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (category !== 'All') params.set('category', category);
    get<{ businesses: BusinessSummary[]; categories: Category[] }>(`/businesses?${params.toString()}`)
      .then((data) => {
        if (cancelled) return;
        setBusinesses(data.businesses);
        setCategories(data.categories);
      })
      .catch(() => {})
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [q, category]);

  function setCategory(name: string) {
    const next = new URLSearchParams(searchParams);
    if (name === 'All') next.delete('category');
    else next.set('category', name);
    setSearchParams(next, { replace: false });
  }

  function handleSearch(event: FormEvent) {
    event.preventDefault();
    const next = new URLSearchParams(searchParams);
    if (input.trim()) next.set('q', input.trim());
    else next.delete('q');
    setSearchParams(next);
  }

  function clearAll() {
    setInput('');
    setSearchParams({});
  }

  return (
    <div className="explore-page">
      <div className="explore-hero">
        <div className="container">
          <Link to="/" className="back-link">
            <ArrowLeft size={15} /> Back home
          </Link>
          <div className="explore-heading-row">
            <div>
              <div className="eyebrow">The directory</div>
              <h1>Find your <em>next hour.</em></h1>
              <p>Independent places across Botswana, honest availability, and a little room in the day for yourself.</p>
            </div>
            <div className="explore-stamp">
              <Sparkles size={18} />
              <span>Hand-picked<br />local places</span>
            </div>
          </div>
          <form className="explore-search" onSubmit={handleSearch}>
            <Search size={20} />
            <input
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Search by business, service, town, or neighborhood"
              aria-label="Search businesses"
            />
            {input && (
              <button type="button" className="search-clear" onClick={() => setInput('')} aria-label="Clear search">
                <X size={16} />
              </button>
            )}
            <button type="submit" className="btn btn-accent">
              Search
            </button>
          </form>
        </div>
      </div>

      <div className="container explore-content">
        <div className="filter-row">
          <div className="category-chips">
            <button className={`chip ${category === 'All' ? 'active' : ''}`} onClick={() => setCategory('All')}>
              All places
            </button>
            {categories.map((item) => (
              <button
                key={item.name}
                className={`chip ${category === item.name ? 'active' : ''}`}
                onClick={() => setCategory(item.name)}
              >
                <CategoryIcon category={item.name} size={14} />
                {item.name}
                <span className="chip-count">{item.count}</span>
              </button>
            ))}
          </div>
          <div className="sort-note">
            <SlidersHorizontal size={15} /> Sorted by most loved
          </div>
        </div>

        {(q || category !== 'All') && (
          <div className="active-filters">
            <span>
              {loading ? <Loader2 size={13} className="spin" /> : businesses.length} result
              {businesses.length === 1 ? '' : 's'}
              {q && <> for “{q}”</>}
              {category !== 'All' && <> in {category}</>}
            </span>
            <button onClick={clearAll}>Clear filters <X size={13} /></button>
          </div>
        )}

        {loading ? (
          <div className="explore-grid">
            {Array.from({ length: 6 }).map((_, index) => <SkeletonCard key={index} />)}
          </div>
        ) : businesses.length > 0 ? (
          <>
            <div className="explore-grid">
              {businesses.map((business) => (
                <BusinessCard key={business.id} business={business} />
              ))}
            </div>
            <div className="explore-endnote">
              <span className="endnote-line" />
              <p>Every place here is independently owned. Book something lovely.</p>
              <span className="endnote-line" />
            </div>
          </>
        ) : (
          <EmptyState
            icon={<Search size={24} />}
            title="Nothing here just yet"
            description="Try a different search, or browse all the good places in the directory."
            action={<button className="btn btn-dark" onClick={clearAll}>Browse all places</button>}
          />
        )}
      </div>
    </div>
  );
}
