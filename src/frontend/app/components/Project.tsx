type ProjectProps = {
  title: string;
  children: React.ReactNode;
  imgSrc?: string;
  imgAlt?: string;
};

const Project = ({ title, children , imgSrc, imgAlt}: ProjectProps) => (
  <div className="flex flex-col lg:flex-row items-center gap-4 mb-2">
    <div className="mb-4">
        <h3 className="text-xl font-semibold">{title}</h3>
        <p>{children}</p>
    </div>
    {imgSrc && (
        <img
          src={imgSrc}
          alt={imgAlt}
          className="rounded-lg shadow-lg w-60 h-60"
        />
    )}
  </div>
);

export default Project;