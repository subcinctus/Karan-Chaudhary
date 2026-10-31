// Frames open like a gate. A study picture, a previs plan, the project frames: each is revealed by a
// clip-path, never a fade: the study and previs frames open from a slit along their centre line
// (inset 50 % → 0, a letterbox opening, 1.1 s expo in-out) while the plan inside settles from 1.1× to
// 1 (1.4 s expo out); the project stills, the sequence's frames and the lighting plot's frame wipe up
// from the bottom (inset 100 % 0 0 0 → 0, 1.1 s expo in-out) as the image inside settles from 1.08×
// to its full frame (blocks drawn after arming arrive by kc:content). At rest every picture is shown
// whole (no oversize, no scroll drift): the frames are cropped to the aspect the film was delivered
// in, and the motion never crops them further. Only clip-path and transform change, and never the size
// of a Player host, so the Players do not redraw.

const SLIT_FROM = 'inset(50% 0% 50% 0%)', OPEN = 'inset(0% 0% 0% 0%)';

export function initFrames(env) {
  const { gsap, owned, state } = env;

  const once = (trigger, start = 'top 85%') => ({ trigger, start, once: true });

  function scan(scope = document) {
    // Study pictures (Player hosts' wrappers): slit open.
    for (const stage of scope.querySelectorAll('.study-block__stage, .reel__frame, .about__portrait')) {
      if (stage.dataset.motionFrame || !env.enters(stage)) continue;
      stage.dataset.motionFrame = '1';
      gsap.fromTo(stage, { clipPath: SLIT_FROM }, { clipPath: OPEN, duration: 1.1, ease: 'kc.io', delay: env.delay(stage), scrollTrigger: once(stage), clearProps: 'clipPath' });
    }
    // Previs slots: the frame opens, the plan settles, the caption rises.
    for (const slot of scope.querySelectorAll('.previs-slot')) {
      if (slot.dataset.motionFrame) continue;
      slot.dataset.motionFrame = '1';
      owned.add(slot);
      if (!env.enters(slot)) continue;
      const frame = slot.querySelector('.previs-slot__frame');
      const inner = slot.querySelectorAll('.previs-slot__plan, .previs-slot__video, .previs-slot__corner');
      const cap = slot.querySelector('.previs-slot__cap');
      const tl = gsap.timeline({ scrollTrigger: once(slot, 'top 88%') });
      if (frame) tl.fromTo(frame, { clipPath: SLIT_FROM }, { clipPath: OPEN, duration: 1.1, ease: 'kc.io', clearProps: 'clipPath' }, 0);
      if (inner.length) tl.from(inner, { scale: 1.1, duration: 1.4, ease: 'kc.out', clearProps: 'transform' }, 0.1);
      if (cap) tl.from(cap.children, { y: 24, autoAlpha: 0, duration: 0.8, ease: 'kc.out', stagger: 0.05, clearProps: 'all' }, 0.3);
    }
    // Project page: the lead frame, the stills, the sequence and the plot's frame. The image inside
    // settles (CSS --ps) to scale 1; images that arrive later (procedural stills paint async) pick it up.
    const lead = scope.querySelector?.('.film__frame');
    for (const frame of [lead, ...scope.querySelectorAll('.still .frame, .sequence .frame, .film-plot__frame')].filter(Boolean)) {
      if (frame.dataset.motionFrame) continue;
      frame.dataset.motionFrame = '1';
      frame.classList.add('kc-settle');
      if (!env.enters(frame)) continue;
      const isLead = frame === lead;
      gsap.timeline({ delay: env.delay(frame), scrollTrigger: once(frame, isLead ? 'top 95%' : 'top 85%') })
        .fromTo(frame, { clipPath: isLead ? SLIT_FROM : 'inset(100% 0% 0% 0%)' }, { clipPath: OPEN, duration: isLead ? 1.2 : 1.1, ease: 'kc.io', clearProps: 'clipPath' }, 0)
        .fromTo(frame, { '--ps': 1.08 }, { '--ps': 1, duration: 1.4, ease: 'kc.out' }, 0.05);
    }
  }

  env.ctx.add(() => scan(document));
  state.scanners.push(scope => env.ctx.add(() => scan(scope)));
  return () => {
    for (const el of document.querySelectorAll('[data-motion-frame]')) { delete el.dataset.motionFrame; el.classList.remove('kc-settle'); el.style.removeProperty('--ps'); }
  };
}
