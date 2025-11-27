let allData = {};
let currentLang = 'en';
let currentProjectFilter = 'All';

// Helper to render lists or paragraphs
const renderContent = (content, type) => {
  if (type === 'list' && Array.isArray(content)) {
    return `<ul class="">
      ${content.map(item => `
        <li class="mt-2.1 text-md text-gray-700 leading-normal">
          <span class="absolute -ml-3 sm:-ml-3.2 select-none transform -translate-y-px">›</span>
          ${item}
        </li>
      `).join('')}
    </ul>`;
  } else if (content) {
    return `<p class="mt-2.1 text-md text-gray-700 leading-normal">${content}</p>`;
  } else {
    return '';
  }
};

const renderProjects = (projects) => {
  const container = document.querySelector('[data-section="projects"]');
  if (!container) return;

  const filteredProjects = currentProjectFilter === 'All'
    ? projects
    : projects.filter(p => p.tags && p.tags.includes(currentProjectFilter));

  const projectsHTML = filteredProjects.map(proj => `
    <section class="mb-4.5 break-inside-avoid">
      <header>
        <h3 class="text-lg font-semibold text-gray-700 leading-snugish">
          ${proj.url ? `
            <a href="${proj.url}" class="group">
              ${proj.name}
              <span class="inline-block text-gray-550 print:text-black font-normal group-hover:text-gray-700 transition duration-100 ease-in">↗</span>
            </a>
          ` : proj.name}
        </h3>
        <p class="leading-normal text-md text-gray-650">
          ${proj.period} | ${proj.tags ? proj.tags.join(', ') : proj.tech}
        </p>
      </header>
      <p class="mt-2.1 text-md text-gray-700 leading-normal">
        ${proj.description}
      </p>
    </section>
  `).join('');

  container.innerHTML = projectsHTML;
};

const renderProjectFilters = (projects) => {
  const container = document.getElementById('project-filters');
  if (!container) return;

  // Extract unique tags
  const tags = new Set(['All']);
  projects.forEach(p => {
    if (p.tags) {
      p.tags.forEach(tag => tags.add(tag));
    }
  });

  container.innerHTML = Array.from(tags).map(tag => `
    <button class="px-2 py-1 text-xs rounded border transition-colors ${tag === currentProjectFilter ? 'bg-gray-700 text-white border-gray-700' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-100'}"
      onclick="setProjectFilter('${tag}')">
      ${tag}
    </button>
  `).join('');
};

// Global function for inline onclick
window.setProjectFilter = (filter) => {
  currentProjectFilter = filter;
  render(currentLang); // Re-render to update projects and active button state
};

const render = (lang) => {
  const data = allData[lang];
  if (!data) return;

  // Update Buttons
  document.getElementById('btn-en').className = lang === 'en' ? 'font-bold text-gray-700 hover:text-black px-2 focus:outline-none' : 'text-gray-500 hover:text-black px-2 focus:outline-none';
  document.getElementById('btn-sv').className = lang === 'sv' ? 'font-bold text-gray-700 hover:text-black px-2 focus:outline-none' : 'text-gray-500 hover:text-black px-2 focus:outline-none';

  // Update Labels
  Object.keys(data.labels).forEach(key => {
    document.querySelectorAll(`[data-label="${key}"]`).forEach(el => el.textContent = data.labels[key]);
  });

  // Update Name and Initials
  document.querySelectorAll('[data-field="name"]').forEach(el => el.textContent = data.name);
  document.querySelectorAll('[data-field="initials"]').forEach(el => el.textContent = data.initials);

  // Render Experience
  const experienceHTML = data.experience.map(exp => `
    <section class="mb-4.5 break-inside-avoid">
      <header>
        <h3 class="text-lg font-semibold text-gray-700 leading-snugish">
          ${exp.company}
        </h3>
        <p class="leading-normal text-md text-gray-650">
          ${exp.period} | ${exp.role}
        </p>
      </header>
      ${renderContent(exp.content, exp.type)}
    </section>
  `).join('');
  document.querySelectorAll('[data-section="experience"]').forEach(el => el.innerHTML = experienceHTML);

  // Render Education
  const educationHTML = data.education.map(edu => `
    <section class="mb-4.5 break-inside-avoid">
      <header>
        <h3 class="text-lg font-semibold text-gray-700 leading-snugish">
          ${edu.institution}
        </h3>
        <p class="leading-normal text-md text-gray-650">
          ${edu.period} | ${edu.degree}
        </p>
      </header>
      ${edu.content ? `<p class="mt-2.1 text-md text-gray-700 leading-normal">${edu.content}</p>` : ''}
    </section>
  `).join('');
  document.querySelectorAll('[data-section="education"]').forEach(el => el.innerHTML = educationHTML);

  // Render Projects & Filters
  renderProjectFilters(data.projects);
  renderProjects(data.projects);

  // Render Skills
  const skillsHTML = data.skills.map(skill => `
    <section class="mb-4.5 break-inside-avoid">
      <header>
        <h3 class="text-lg font-semibold text-gray-700 leading-snugish">
          ${skill.name}
        </h3>
        ${skill.level ? `<p class="leading-normal text-md text-gray-650">${skill.level}</p>` : ''}
      </header>
      ${skill.description ? `<p class="mt-2.1 text-md text-gray-700 leading-normal">${skill.description}</p>` : ''}
      <div class="my-3.2 last:pb-1.5">
        <ul class="flex flex-wrap text-md leading-relaxed -mr-1.6 -mb-1.6">
          ${skill.tags.map(tag => `
            <li class="px-2.5 mr-1.6 mb-1.6 text-base text-gray-750 leading-relaxed print:bg-white print:border-inset bg-gray-250">
              ${tag}
            </li>
          `).join('')}
        </ul>
      </div>
    </section>
  `).join('');
  document.querySelectorAll('[data-section="skills"]').forEach(el => el.innerHTML = skillsHTML);

  // Render Contact
  const contactHTML = `
    <ul class="list-inside pr-7">
      ${data.contact.map(item => `
        <li class="mt-1.5 leading-normal text-gray-700 text-md">
          ${item.isLink ? `
            <a href="${item.url}" class="group">
              ${item.text}
              <span class="inline-block text-gray-550 print:text-black font-normal group-hover:text-gray-700 transition duration-100 ease-in">↗</span>
            </a>
          ` : item.text}
        </li>
      `).join('')}
    </ul>
  `;
  document.querySelectorAll('[data-section="contact"]').forEach(el => el.innerHTML = contactHTML);

  // Render About
  const aboutHTML = data.about.map(item => `
    <section class="mb-4.5 break-inside-avoid">
      <header>
        <h3 class="text-lg font-semibold text-gray-700 leading-snugish">
          ${item.title}
        </h3>
        <p class="leading-normal text-md text-gray-650">
          ${item.period}
        </p>
      </header>
      <div class="mt-2.1 text-md text-gray-700 leading-normal">
        ${item.description}
      </div>
    </section>
  `).join('');
  document.querySelectorAll('[data-section="about"]').forEach(el => el.innerHTML = aboutHTML);
};

fetch('data.json')
  .then(response => response.json())
  .then(data => {
    allData = data;
    // Initial render
    render(currentLang);

    // Event Listeners
    document.getElementById('btn-en').addEventListener('click', () => {
      currentLang = 'en';
      // Reset filter when switching language? Maybe keep it if tags match.
      // For safety/simplicity, we can keep it, but if tags differ, it might show nothing.
      // Let's reset to 'All' for safety.
      currentProjectFilter = 'All';
      render(currentLang);
    });
    document.getElementById('btn-sv').addEventListener('click', () => {
      currentLang = 'sv';
      currentProjectFilter = 'All';
      render(currentLang);
    });
  })
  .catch(err => console.error('Error loading resume data:', err));