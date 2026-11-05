import type { MaterialModel } from "./material-library-data";

/** Older official collections may predate structured profile fields. */
export function modelProfile(model:MaterialModel,officials:MaterialModel[]=[]) {
  const official=model.source==="official"?officials.find(item=>item.image===model.image):undefined;
  return {
    gender:model.gender??official?.gender,
    age:model.age??official?.age,
    appearance:model.appearance??official?.appearance,
    persona:model.persona??official?.persona,
    bodyType:model.bodyType??official?.bodyType,
    features:[model.features??official?.features??model.description,...(model.adjustments??[])].filter((value,index,all)=>value&&all.indexOf(value)===index).join("；"),
  };
}

export function canPublishModel(model:MaterialModel):boolean {
  return model.source!=="official";
}

export function modelVisibleInSpace(model:MaterialModel,space:"personal"|"enterprise"):boolean {
  return model.space===space&&!model.deletedAt&&(space!=="enterprise"||canPublishModel(model));
}
